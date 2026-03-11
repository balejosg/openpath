/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Machine registration regression tests
 */

import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  TEST_RUN_ID,
  bootstrapAdminSession,
  uniqueEmail,
  trpcMutate as _trpcMutate,
  trpcQuery as _trpcQuery,
  parseTRPC,
  bearerAuth,
  getAvailablePort,
  resetDb,
} from './test-utils.js';
import { closeConnection } from '../src/db/index.js';
import { buildMachineKey } from '../src/lib/classroom-storage.js';

let ADMIN_TOKEN = '';
const SHARED_SECRET = 'test-shared-secret';

let PORT: number;
let API_URL: string;
let server: Server | undefined;
let testDataDir: string | null = null;

const trpcMutate = (
  procedure: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<Response> => _trpcMutate(API_URL, procedure, input, headers);

const trpcQuery = (
  procedure: string,
  input?: unknown,
  headers: Record<string, string> = {}
): Promise<Response> => _trpcQuery(API_URL, procedure, input, headers);

async function createUser(params: {
  prefix: string;
  role?: 'teacher' | 'admin';
}): Promise<{ accessToken: string }> {
  const email = uniqueEmail(params.prefix);
  const password = 'Password123!';

  const createResponse = await trpcMutate(
    'users.create',
    {
      email,
      password,
      name: `${params.prefix} user`,
      ...(params.role ? { role: params.role } : {}),
    },
    bearerAuth(ADMIN_TOKEN)
  );

  assert.strictEqual(createResponse.status, 200);

  const loginResponse = await trpcMutate('auth.login', { email, password });
  assert.strictEqual(loginResponse.status, 200);

  const loginData = (await parseTRPC(loginResponse)).data as { accessToken: string };
  assert.ok(loginData.accessToken);

  return { accessToken: loginData.accessToken };
}

async function createGroup(name: string): Promise<string> {
  const response = await trpcMutate(
    'groups.create',
    { name, displayName: name },
    bearerAuth(ADMIN_TOKEN)
  );

  assert.strictEqual(response.status, 200);
  return ((await parseTRPC(response)).data as { id: string }).id;
}

async function createClassroom(name: string, defaultGroupId: string): Promise<string> {
  const response = await trpcMutate(
    'classrooms.create',
    { name, displayName: name, defaultGroupId },
    bearerAuth(ADMIN_TOKEN)
  );

  assert.ok([200, 201].includes(response.status));
  return ((await parseTRPC(response)).data as { id: string }).id;
}

async function listMachines(
  classroomId?: string
): Promise<{ id: string; hostname: string; classroomId?: string | null }[]> {
  const response = await trpcQuery(
    'classrooms.listMachines',
    classroomId ? { classroomId } : {},
    bearerAuth(ADMIN_TOKEN)
  );
  assert.strictEqual(response.status, 200);
  return (await parseTRPC(response)).data as {
    id: string;
    hostname: string;
    classroomId?: string | null;
  }[];
}

async function getEnrollmentTicket(classroomId: string, accessToken: string): Promise<string> {
  const response = await fetch(`${API_URL}/api/enroll/${classroomId}/ticket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert.strictEqual(response.status, 200);
  const data = (await response.json()) as { enrollmentToken: string };
  assert.ok(data.enrollmentToken);
  return data.enrollmentToken;
}

await describe('Machine registration regressions', async () => {
  before(async () => {
    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;

    process.env.PORT = String(PORT);
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.SHARED_SECRET = SHARED_SECRET;

    testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpath-machine-registration-'));
    process.env.DATA_DIR = testDataDir;

    const etcPath = path.join(process.cwd(), 'etc');
    if (!fs.existsSync(etcPath)) fs.mkdirSync(etcPath, { recursive: true });

    const { app } = await import('../src/server.js');
    server = app.listen(PORT);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  beforeEach(async () => {
    await resetDb();
    ADMIN_TOKEN = (await bootstrapAdminSession(API_URL, { name: 'Machine Registration Admin' }))
      .accessToken;
  });

  after(async () => {
    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          resolve();
        });
      });
    }

    await closeConnection();

    if (testDataDir) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
      testDataDir = null;
    }
  });

  await test('same reported hostname in two classrooms should not collide', async () => {
    const groupA = await createGroup(`group-a-${TEST_RUN_ID}`);
    const groupB = await createGroup(`group-b-${TEST_RUN_ID}`);
    const classroomA = await createClassroom(`room-a-${TEST_RUN_ID}`, groupA);
    const classroomB = await createClassroom(`room-b-${TEST_RUN_ID}`, groupB);
    const admin = await createUser({ prefix: 'machine-scope-admin-a', role: 'admin' });
    const enrollmentTokenA = await getEnrollmentTicket(classroomA, admin.accessToken);
    const enrollmentTokenB = await getEnrollmentTicket(classroomB, admin.accessToken);

    const firstRegistration = await trpcMutate(
      'classrooms.registerMachine',
      { hostname: 'shared-host', classroomId: classroomA },
      { Authorization: `Bearer ${enrollmentTokenA}` }
    );
    assert.ok([200, 201].includes(firstRegistration.status));

    const secondRegistration = await trpcMutate(
      'classrooms.registerMachine',
      { hostname: 'shared-host', classroomId: classroomB },
      { Authorization: `Bearer ${enrollmentTokenB}` }
    );
    assert.ok([200, 201].includes(secondRegistration.status));

    const machines = await listMachines();
    const roomAMachine = machines.find((machine) => machine.classroomId === classroomA);
    const roomBMachine = machines.find((machine) => machine.classroomId === classroomB);

    assert.ok(roomAMachine, 'room A should keep its machine');
    assert.ok(roomBMachine, 'room B should get its own machine');
    assert.notStrictEqual(roomAMachine.hostname, roomBMachine.hostname);
    assert.strictEqual(roomAMachine.hostname, buildMachineKey(classroomA, 'shared-host'));
    assert.strictEqual(roomBMachine.hostname, buildMachineKey(classroomB, 'shared-host'));
  });

  await test('scoped registration should not steal an existing machine from another classroom', async () => {
    const groupA = await createGroup(`group-steal-a-${TEST_RUN_ID}`);
    const groupB = await createGroup(`group-steal-b-${TEST_RUN_ID}`);
    const classroomA = await createClassroom(`room-steal-a-${TEST_RUN_ID}`, groupA);
    const classroomB = await createClassroom(`room-steal-b-${TEST_RUN_ID}`, groupB);
    const admin = await createUser({ prefix: 'machine-scope-admin-b', role: 'admin' });
    const enrollmentTokenA = await getEnrollmentTicket(classroomA, admin.accessToken);
    const enrollmentTokenB = await getEnrollmentTicket(classroomB, admin.accessToken);

    await trpcMutate(
      'classrooms.registerMachine',
      { hostname: 'lab-pc', classroomId: classroomA },
      { Authorization: `Bearer ${enrollmentTokenA}` }
    );
    await trpcMutate(
      'classrooms.registerMachine',
      { hostname: 'lab-pc', classroomId: classroomB },
      { Authorization: `Bearer ${enrollmentTokenB}` }
    );

    const roomAMachines = await listMachines(classroomA);
    const roomBMachines = await listMachines(classroomB);

    assert.strictEqual(roomAMachines.length, 1);
    assert.strictEqual(roomBMachines.length, 1);
    assert.strictEqual(roomAMachines[0]?.hostname, buildMachineKey(classroomA, 'lab-pc'));
    assert.strictEqual(roomBMachines[0]?.hostname, buildMachineKey(classroomB, 'lab-pc'));
  });

  await test('REST enrollment and tRPC registration should use the same machine key strategy', async () => {
    const groupId = await createGroup(`group-rest-${TEST_RUN_ID}`);
    const classroomId = await createClassroom(`room-rest-${TEST_RUN_ID}`, groupId);
    const admin = await createUser({ prefix: 'machine-admin', role: 'admin' });
    const enrollmentToken = await getEnrollmentTicket(classroomId, admin.accessToken);

    const restResponse = await fetch(`${API_URL}/api/machines/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${enrollmentToken}`,
      },
      body: JSON.stringify({
        hostname: 'hybrid-host',
        classroomId,
      }),
    });
    assert.strictEqual(restResponse.status, 200);
    const restData = (await restResponse.json()) as { machineHostname: string };

    const trpcResponse = await trpcMutate(
      'classrooms.registerMachine',
      { hostname: 'hybrid-host', classroomId },
      { Authorization: `Bearer ${enrollmentToken}` }
    );
    assert.ok([200, 201].includes(trpcResponse.status));

    const machines = await listMachines(classroomId);
    assert.strictEqual(machines.length, 1);
    const [registeredMachine] = machines;
    assert.ok(registeredMachine);
    assert.strictEqual(registeredMachine.hostname, restData.machineHostname);
    assert.strictEqual(registeredMachine.hostname, buildMachineKey(classroomId, 'hybrid-host'));
  });
});
