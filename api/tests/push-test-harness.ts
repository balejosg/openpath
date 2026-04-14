import { after, before } from 'node:test';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import webPush from 'web-push';

interface UserResult {
  id?: string;
}

interface AuthResult {
  accessToken?: string;
}

export interface PushScenario {
  adminToken: string;
  teacherToken: string;
  teacherUserId: string;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
}

type HttpTestHarness = import('./http-test-harness.js').HttpTestHarness;
interface TRPCResponse {
  error?: { code: string; data?: { code: string }; message: string };
  result?: { data: unknown };
}

let harness: HttpTestHarness | undefined;
let scenario: PushScenario | undefined;

function getHarness(): HttpTestHarness {
  assert.ok(harness, 'Push HTTP harness should be initialized');
  return harness;
}

export function getPushScenario(): PushScenario {
  assert.ok(scenario, 'Push scenario should be initialized');
  return scenario;
}

export function registerPushLifecycle(): void {
  before(async () => {
    const keys = webPush.generateVAPIDKeys();
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;

    const { startHttpTestHarness } = await import('./http-test-harness.js');

    harness = await startHttpTestHarness({
      env: {
        VAPID_SUBJECT: 'mailto:test@example.com',
        VAPID_PUBLIC_KEY: keys.publicKey,
        VAPID_PRIVATE_KEY: keys.privateKey,
      },
      readyDelayMs: 1_000,
      resetDb: true,
      resetDbOnClose: true,
    });

    scenario = await provisionPushScenario();
  });

  after(async () => {
    scenario = undefined;
    await harness?.close();
    harness = undefined;
  });
}

export async function trpcMutate(
  procedure: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  return getHarness().trpcMutate(procedure, input, headers);
}

export async function trpcQuery(
  procedure: string,
  input?: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  return getHarness().trpcQuery(procedure, input, headers);
}

export async function parseTRPC(
  response: Response
): Promise<{ code?: string; data?: unknown; error?: string }> {
  const json = (await response.json()) as TRPCResponse;

  if (json.result !== undefined) {
    return { data: json.result.data };
  }

  if (json.error !== undefined) {
    return { error: json.error.message, code: json.error.data?.code ?? json.error.code };
  }

  return {};
}

export function createMockSubscription(label: string): PushSubscriptionPayload {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${label}-${Date.now().toString()}`,
    keys: {
      p256dh:
        'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      auth: 'tBHItfGKZpJRN_CYzfPWpQ',
    },
  };
}

async function provisionPushScenario(): Promise<PushScenario> {
  const adminToken = (await getHarness().bootstrapAdminSession({ name: 'Push Test Admin' }))
    .accessToken;
  const teacherEmail = `push-test-teacher-${randomUUID()}@test.local`;
  const teacherPassword = 'TeacherPassword123!';

  const createTeacherResponse = await trpcMutate(
    'users.create',
    {
      email: teacherEmail,
      password: teacherPassword,
      name: 'Teacher for Push',
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assert.equal(createTeacherResponse.status, 200);

  const createdTeacher = (await parseTRPC(createTeacherResponse)).data as UserResult;
  const teacherUserId = createdTeacher.id ?? '';
  assert.notEqual(teacherUserId, '', 'Expected teacher creation to return an id');

  const assignRoleResponse = await trpcMutate(
    'users.assignRole',
    {
      userId: teacherUserId,
      role: 'teacher',
      groupIds: ['ciencias-3eso'],
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  assert.equal(assignRoleResponse.status, 200);

  const loginResponse = await trpcMutate('auth.login', {
    email: teacherEmail,
    password: teacherPassword,
  });
  assert.equal(loginResponse.status, 200);

  const loginData = (await parseTRPC(loginResponse)).data as AuthResult;
  const teacherToken = loginData.accessToken ?? '';
  assert.notEqual(teacherToken, '', 'Expected teacher login to return an access token');

  return {
    adminToken,
    teacherToken,
    teacherUserId,
  };
}
