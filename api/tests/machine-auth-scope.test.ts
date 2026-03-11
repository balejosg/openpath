/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Machine authentication scope regressions
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  TEST_RUN_ID,
  bootstrapAdminSession,
  uniqueDomain,
  uniqueEmail,
  trpcMutate as _trpcMutate,
  parseTRPC,
  bearerAuth,
  getAvailablePort,
  resetDb,
} from './test-utils.js';
import { closeConnection } from '../src/db/index.js';
import { computeMachineProofToken } from '../src/lib/machine-proof.js';

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

async function createUser(params: {
  prefix: string;
  role?: 'teacher' | 'admin';
  groupIds?: string[];
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
      ...(params.groupIds ? { groupIds: params.groupIds } : {}),
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

async function getEnrollmentTicket(classroomId: string, accessToken: string): Promise<string> {
  const response = await requestEnrollmentTicket(classroomId, accessToken, 2);

  assert.strictEqual(response.status, 200);
  const data = (await response.json()) as { enrollmentToken: string };
  assert.ok(data.enrollmentToken);
  return data.enrollmentToken;
}

async function requestEnrollmentTicket(
  classroomId: string,
  accessToken: string,
  notFoundRetries = 0
): Promise<Response> {
  for (let attempt = 0; attempt <= notFoundRetries; attempt += 1) {
    const response = await fetch(`${API_URL}/api/enroll/${classroomId}/ticket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status !== 404 || attempt === notFoundRetries) {
      return response;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error('Unreachable enrollment ticket retry state');
}

function extractMachineToken(whitelistUrl: string): string {
  const match = /\/w\/([^/]+)\//.exec(whitelistUrl);
  assert.ok(match, `Expected tokenized whitelist URL, got ${whitelistUrl}`);
  const token = match[1];
  assert.ok(token, `Expected machine token in ${whitelistUrl}`);
  return token;
}

async function registerMachine(params: {
  classroomId: string;
  hostname: string;
  enrollmentToken: string;
}): Promise<{ machineHostname: string; machineToken: string }> {
  const response = await fetch(`${API_URL}/api/machines/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.enrollmentToken}`,
    },
    body: JSON.stringify({
      hostname: params.hostname,
      classroomId: params.classroomId,
    }),
  });

  assert.strictEqual(response.status, 200);
  const data = (await response.json()) as {
    machineHostname: string;
    whitelistUrl: string;
  };

  assert.ok(data.machineHostname);
  assert.ok(data.whitelistUrl);

  return {
    machineHostname: data.machineHostname,
    machineToken: extractMachineToken(data.whitelistUrl),
  };
}

await describe('Machine authentication scope regressions', async () => {
  before(async () => {
    await resetDb();

    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;

    process.env.PORT = String(PORT);
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.SHARED_SECRET = SHARED_SECRET;

    testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpath-machine-auth-scope-'));
    process.env.DATA_DIR = testDataDir;

    const etcPath = path.join(process.cwd(), 'etc');
    if (!fs.existsSync(etcPath)) fs.mkdirSync(etcPath, { recursive: true });

    const { app } = await import('../src/server.js');
    server = app.listen(PORT);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    ADMIN_TOKEN = (await bootstrapAdminSession(API_URL, { name: 'Machine Scope Admin' }))
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

  await test('teacher cannot mint an enrollment token for another classroom', async () => {
    const allowedGroupId = await createGroup(`allowed-group-${TEST_RUN_ID}`);
    const deniedGroupId = await createGroup(`denied-group-${TEST_RUN_ID}`);
    const allowedClassroomId = await createClassroom(`allowed-room-${TEST_RUN_ID}`, allowedGroupId);
    const deniedClassroomId = await createClassroom(`denied-room-${TEST_RUN_ID}`, deniedGroupId);

    const teacher = await createUser({
      prefix: 'teacher-scope-ticket',
      role: 'teacher',
      groupIds: [allowedGroupId],
    });

    const allowedResponse = await requestEnrollmentTicket(
      allowedClassroomId,
      teacher.accessToken,
      2
    );
    assert.strictEqual(allowedResponse.status, 200);

    const deniedResponse = await requestEnrollmentTicket(deniedClassroomId, teacher.accessToken);
    assert.strictEqual(deniedResponse.status, 403);
  });

  await test('classroom-scoped enrollment and machine tokens cannot cross classroom boundaries', async () => {
    const groupA = await createGroup(`scope-group-a-${TEST_RUN_ID}`);
    const groupB = await createGroup(`scope-group-b-${TEST_RUN_ID}`);
    const classroomA = await createClassroom(`scope-room-a-${TEST_RUN_ID}`, groupA);
    const classroomB = await createClassroom(`scope-room-b-${TEST_RUN_ID}`, groupB);

    const ticketA = await getEnrollmentTicket(classroomA, ADMIN_TOKEN);
    const ticketB = await getEnrollmentTicket(classroomB, ADMIN_TOKEN);

    const mismatchedRegistration = await trpcMutate(
      'classrooms.registerMachine',
      { hostname: 'scoped-a', classroomId: classroomB },
      bearerAuth(ticketA)
    );
    assert.strictEqual(mismatchedRegistration.status, 403);

    const machineA = await registerMachine({
      classroomId: classroomA,
      hostname: 'scoped-a',
      enrollmentToken: ticketA,
    });
    const machineB = await registerMachine({
      classroomId: classroomB,
      hostname: 'scoped-b',
      enrollmentToken: ticketB,
    });

    const reportResponse = await trpcMutate(
      'healthReports.submit',
      {
        hostname: machineB.machineHostname,
        status: 'HEALTHY',
      },
      bearerAuth(machineA.machineToken)
    );
    assert.strictEqual(reportResponse.status, 403);
  });

  await test('machine operational endpoints reject global shared-secret-only access and accept machine tokens', async () => {
    const groupId = await createGroup(`machine-group-${TEST_RUN_ID}`);
    const classroomId = await createClassroom(`machine-room-${TEST_RUN_ID}`, groupId);
    const enrollmentToken = await getEnrollmentTicket(classroomId, ADMIN_TOKEN);
    const machine = await registerMachine({
      classroomId,
      hostname: 'machine-scope-host',
      enrollmentToken,
    });

    const legacyProof = computeMachineProofToken(machine.machineHostname, SHARED_SECRET);

    const sharedSecretHealth = await trpcMutate(
      'healthReports.submit',
      {
        hostname: machine.machineHostname,
        status: 'HEALTHY',
      },
      bearerAuth(SHARED_SECRET)
    );
    assert.strictEqual(sharedSecretHealth.status, 401);

    const legacyRequest = await fetch(`${API_URL}/api/requests/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: uniqueDomain('legacy-proof'),
        reason: 'legacy proof should be rejected',
        hostname: machine.machineHostname,
        token: legacyProof,
      }),
    });
    assert.strictEqual(legacyRequest.status, 403);

    const sharedSecretRotation = await fetch(
      `${API_URL}/api/machines/${machine.machineHostname}/rotate-download-token`,
      {
        method: 'POST',
        headers: bearerAuth(SHARED_SECRET),
      }
    );
    assert.strictEqual(sharedSecretRotation.status, 403);

    const machineHealth = await trpcMutate(
      'healthReports.submit',
      {
        hostname: machine.machineHostname,
        status: 'HEALTHY',
        dnsmasqRunning: true,
        dnsResolving: true,
      },
      bearerAuth(machine.machineToken)
    );
    assert.strictEqual(machineHealth.status, 200);

    const requestResponse = await fetch(`${API_URL}/api/requests/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: uniqueDomain('machine-token'),
        reason: 'machine token should work',
        hostname: machine.machineHostname,
        token: machine.machineToken,
        origin_host: 'machine.local',
      }),
    });
    assert.strictEqual(requestResponse.status, 200);

    const rotatedResponse = await fetch(
      `${API_URL}/api/machines/${machine.machineHostname}/rotate-download-token`,
      {
        method: 'POST',
        headers: bearerAuth(machine.machineToken),
      }
    );
    assert.strictEqual(rotatedResponse.status, 200);

    const rotatedData = (await rotatedResponse.json()) as { whitelistUrl: string };
    const rotatedMachineToken = extractMachineToken(rotatedData.whitelistUrl);
    assert.notStrictEqual(rotatedMachineToken, machine.machineToken);

    const oldTokenHealth = await trpcMutate(
      'healthReports.submit',
      {
        hostname: machine.machineHostname,
        status: 'HEALTHY',
      },
      bearerAuth(machine.machineToken)
    );
    assert.strictEqual(oldTokenHealth.status, 401);

    const newTokenHealth = await trpcMutate(
      'healthReports.submit',
      {
        hostname: machine.machineHostname,
        status: 'HEALTHY',
      },
      bearerAuth(rotatedMachineToken)
    );
    assert.strictEqual(newTokenHealth.status, 200);
  });
});
