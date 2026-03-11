/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Classroom authorization regressions
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  TEST_RUN_ID,
  uniqueEmail,
  trpcMutate as _trpcMutate,
  trpcQuery as _trpcQuery,
  parseTRPC,
  bearerAuth,
  getAvailablePort,
  resetDb,
} from './test-utils.js';
import { closeConnection } from '../src/db/index.js';

let ADMIN_TOKEN = '';
let PORT: number;
let API_URL: string;
let server: Server | undefined;
let testDataDir: string | null = null;

let teacherToken = '';
let memberToken = '';
let allowedGroupId = '';
let deniedGroupId = '';
let allowedClassroomId = '';
let deniedClassroomId = '';
let deniedMachineId = '';
let deniedScheduleId = '';
let deniedExemptionId = '';
const ADMIN_EMAIL = uniqueEmail('classroom-authz-admin');
const ADMIN_PASSWORD = 'AdminPassword123!';

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

function createQuarterHourWindow(): { startAt: string; endAt: string } {
  const startAt = new Date(Date.now() - 15 * 60 * 1000);
  startAt.setSeconds(0, 0);
  startAt.setMinutes(Math.floor(startAt.getMinutes() / 15) * 15);

  const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  };
}

async function createUser(params: {
  prefix: string;
  role?: 'teacher' | 'admin';
  groupIds?: string[];
}): Promise<{ accessToken: string; email: string; userId: string }> {
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
  const created = (await parseTRPC(createResponse)).data as { id: string };
  assert.ok(created.id);

  const loginResponse = await trpcMutate('auth.login', { email, password });
  assert.strictEqual(loginResponse.status, 200);
  const loginData = (await parseTRPC(loginResponse)).data as { accessToken: string };
  assert.ok(loginData.accessToken);

  return { accessToken: loginData.accessToken, email, userId: created.id };
}

async function createGroup(name: string): Promise<string> {
  const response = await trpcMutate(
    'groups.create',
    { name, displayName: name },
    bearerAuth(ADMIN_TOKEN)
  );
  assert.strictEqual(response.status, 200);
  const data = (await parseTRPC(response)).data as { id: string };
  assert.ok(data.id);
  return data.id;
}

async function createClassroom(name: string, defaultGroupId: string): Promise<string> {
  const response = await trpcMutate(
    'classrooms.create',
    { name, displayName: name, defaultGroupId },
    bearerAuth(ADMIN_TOKEN)
  );

  assert.ok([200, 201].includes(response.status));
  const data = (await parseTRPC(response)).data as { id: string };
  assert.ok(data.id);
  return data.id;
}

await describe('Classroom authorization regressions', async () => {
  before(async () => {
    await resetDb();

    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;

    process.env.PORT = String(PORT);
    process.env.JWT_SECRET = 'test-jwt-secret';
    testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpath-classroom-authz-'));
    process.env.DATA_DIR = testDataDir;

    const etcPath = path.join(process.cwd(), 'etc');
    if (!fs.existsSync(etcPath)) fs.mkdirSync(etcPath, { recursive: true });

    const { app } = await import('../src/server.js');
    server = app.listen(PORT);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const setupResponse = await trpcMutate('setup.createFirstAdmin', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: 'Classroom Auth Admin',
    });
    assert.ok([200, 201, 409].includes(setupResponse.status));

    const loginResponse = await trpcMutate('auth.login', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    assert.strictEqual(loginResponse.status, 200);
    ADMIN_TOKEN = ((await parseTRPC(loginResponse)).data as { accessToken: string }).accessToken;
    assert.ok(ADMIN_TOKEN);

    allowedGroupId = await createGroup(`allowed-${TEST_RUN_ID}`);
    deniedGroupId = await createGroup(`denied-${TEST_RUN_ID}`);

    allowedClassroomId = await createClassroom(`room-allowed-${TEST_RUN_ID}`, allowedGroupId);
    deniedClassroomId = await createClassroom(`room-denied-${TEST_RUN_ID}`, deniedGroupId);

    const teacher = await createUser({
      prefix: 'teacher-scope',
      role: 'teacher',
      groupIds: [allowedGroupId],
    });
    teacherToken = teacher.accessToken;

    const member = await createUser({ prefix: 'member-scope' });
    memberToken = member.accessToken;

    const enrollmentTicketResponse = await fetch(
      `${API_URL}/api/enroll/${deniedClassroomId}/ticket`,
      {
        method: 'POST',
        headers: bearerAuth(ADMIN_TOKEN),
      }
    );
    assert.strictEqual(enrollmentTicketResponse.status, 200);
    const enrollmentTicket = (await enrollmentTicketResponse.json()) as {
      enrollmentToken?: string;
    };
    assert.ok(enrollmentTicket.enrollmentToken);

    const registerMachineResponse = await trpcMutate(
      'classrooms.registerMachine',
      {
        hostname: `lab-pc-${TEST_RUN_ID}`,
        classroomId: deniedClassroomId,
      },
      { Authorization: `Bearer ${enrollmentTicket.enrollmentToken}` }
    );
    assert.ok([200, 201].includes(registerMachineResponse.status));

    const deniedClassroomResponse = await trpcQuery(
      'classrooms.get',
      { id: deniedClassroomId },
      bearerAuth(ADMIN_TOKEN)
    );
    assert.strictEqual(deniedClassroomResponse.status, 200);
    const deniedClassroom = (await parseTRPC(deniedClassroomResponse)).data as {
      machines?: { id: string }[];
    };
    deniedMachineId = deniedClassroom.machines?.[0]?.id ?? '';
    assert.ok(deniedMachineId);

    const { startAt, endAt } = createQuarterHourWindow();
    const scheduleResponse = await trpcMutate(
      'schedules.createOneOff',
      {
        classroomId: deniedClassroomId,
        groupId: deniedGroupId,
        startAt,
        endAt,
      },
      bearerAuth(ADMIN_TOKEN)
    );
    assert.strictEqual(scheduleResponse.status, 200);
    deniedScheduleId = ((await parseTRPC(scheduleResponse)).data as { id: string }).id;
    assert.ok(deniedScheduleId);

    const exemptionResponse = await trpcMutate(
      'classrooms.createExemption',
      {
        machineId: deniedMachineId,
        classroomId: deniedClassroomId,
        scheduleId: deniedScheduleId,
      },
      bearerAuth(ADMIN_TOKEN)
    );
    assert.strictEqual(exemptionResponse.status, 200);
    deniedExemptionId = ((await parseTRPC(exemptionResponse)).data as { id: string }).id;
    assert.ok(deniedExemptionId);
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

  await test('teacher should only list classrooms within their scope', async () => {
    const response = await trpcQuery('classrooms.list', undefined, bearerAuth(teacherToken));
    assert.strictEqual(response.status, 200);

    const data = (await parseTRPC(response)).data as { id: string }[];
    assert.ok(Array.isArray(data));
    assert.ok(data.some((classroom) => classroom.id === allowedClassroomId));
    assert.ok(!data.some((classroom) => classroom.id === deniedClassroomId));
  });

  await test('teacher should not read another classroom', async () => {
    const response = await trpcQuery(
      'classrooms.get',
      { id: deniedClassroomId },
      bearerAuth(teacherToken)
    );
    assert.strictEqual(response.status, 403);
  });

  await test('teacher should not change another classroom active group', async () => {
    const response = await trpcMutate(
      'classrooms.setActiveGroup',
      { id: deniedClassroomId, groupId: allowedGroupId },
      bearerAuth(teacherToken)
    );
    assert.strictEqual(response.status, 403);
  });

  await test('teacher should not create exemptions outside assigned scope', async () => {
    const response = await trpcMutate(
      'classrooms.createExemption',
      {
        machineId: deniedMachineId,
        classroomId: deniedClassroomId,
        scheduleId: deniedScheduleId,
      },
      bearerAuth(teacherToken)
    );
    assert.strictEqual(response.status, 403);
  });

  await test('teacher should not delete exemptions outside assigned scope', async () => {
    const response = await trpcMutate(
      'classrooms.deleteExemption',
      { id: deniedExemptionId },
      bearerAuth(teacherToken)
    );
    assert.strictEqual(response.status, 403);
  });

  await test('teacher should not list exemptions outside assigned scope', async () => {
    const response = await trpcQuery(
      'classrooms.listExemptions',
      { classroomId: deniedClassroomId },
      bearerAuth(teacherToken)
    );
    assert.strictEqual(response.status, 403);
  });

  await test('authenticated member should not read schedules by classroom id', async () => {
    const response = await trpcQuery(
      'schedules.getByClassroom',
      { classroomId: deniedClassroomId },
      bearerAuth(memberToken)
    );
    assert.strictEqual(response.status, 403);
  });

  await test('authenticated member should not read the current classroom schedule', async () => {
    const response = await trpcQuery(
      'schedules.getCurrentForClassroom',
      { classroomId: deniedClassroomId },
      bearerAuth(memberToken)
    );
    assert.strictEqual(response.status, 403);
  });

  await test('teacher should not create schedules in another classroom', async () => {
    const response = await trpcMutate(
      'schedules.create',
      {
        classroomId: deniedClassroomId,
        groupId: allowedGroupId,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '10:00',
      },
      bearerAuth(teacherToken)
    );
    assert.strictEqual(response.status, 403);
  });
});
