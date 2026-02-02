/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Push Notifications API Tests (tRPC)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import webPush from 'web-push';

// Setting env vars BEFORE dynamic imports
const keys = webPush.generateVAPIDKeys();
process.env.VAPID_SUBJECT = 'mailto:test@example.com';
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;

let PORT: number;
let API_URL: string;
let testUtils: any;
let db: any;

const mockSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
  keys: {
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItfGKZpJRN_CYzfPWpQ',
  },
};

let server: Server | undefined;
let adminToken: string | null = null;
let teacherToken: string | null = null;
let teacherUserId: string | null = null;

// Helper to call tRPC mutations
async function trpcMutate(
  procedure: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  const response = await fetch(`${API_URL}/trpc/${procedure}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(input),
  });
  return response;
}

// Helper to call tRPC queries
async function trpcQuery(
  procedure: string,
  input?: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  let url = `${API_URL}/trpc/${procedure}`;
  if (input !== undefined) {
    url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
  }
  const response = await fetch(url, { headers });
  return response;
}

// Parse tRPC response
interface TRPCResponse {
  result?: { data: unknown };
  error?: { message: string; code: string; data?: { code: string } };
}

interface PushResult {
  subscriptionId?: string;
  groupIds?: string[];
  pushEnabled?: boolean;
  subscriptions?: unknown[];
  success?: boolean;
}

interface VapidResult {
  publicKey?: string;
  enabled?: boolean;
}

interface UserResult {
  id: string;
  email: string;
  name: string;
}

interface AuthResult {
  accessToken?: string;
  user?: UserResult;
}

async function parseTRPC(
  response: Response
): Promise<{ data?: unknown; error?: string; code?: string }> {
  const json = (await response.json()) as TRPCResponse;
  if (json.result !== undefined) {
    return { data: json.result.data };
  }
  if (json.error !== undefined) {
    return { error: json.error.message, code: json.error.data?.code ?? json.error.code };
  }
  return {};
}

await describe('Push Notifications API Tests (tRPC)', { timeout: 45000 }, async () => {
  before(async () => {
    // Dynamic imports to ensure process.env is set before config.js is loaded
    testUtils = await import('./test-utils.js');
    db = await import('../src/db/index.js');
    const { app } = await import('../src/server.js');

    await testUtils.resetDb();
    PORT = await testUtils.getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);
    process.env.ADMIN_TOKEN = 'test-admin-token';

    server = app.listen(PORT, () => {
      console.log(`Push test server started on port ${String(PORT)}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    adminToken = 'test-admin-token';
  });

  after(async () => {
    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        (server as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          console.log('Push test server closed');
          resolve();
        });
      });
    }
    if (db !== undefined) {
      await db.closeConnection();
    }
  });

  await test('Setup: Create Teacher and Get Token', async (): Promise<void> => {
    const token = adminToken ?? '';
    const email = `push-test-teacher-${String(Date.now())}@test.com`;

    const response = await trpcMutate(
      'users.create',
      {
        email,
        password: 'TeacherPassword123!',
        name: 'Teacher for Push',
      },
      { Authorization: `Bearer ${token}` }
    );

    assert.strictEqual(response.status, 200);
    const resUser = await parseTRPC(response);
    const userData = resUser.data as UserResult;
    teacherUserId = userData.id;

    await trpcMutate(
      'users.assignRole',
      {
        userId: teacherUserId,
        role: 'teacher',
        groupIds: ['ciencias-3eso'],
      },
      { Authorization: `Bearer ${token}` }
    );

    const loginRes = await trpcMutate('auth.login', {
      email,
      password: 'TeacherPassword123!',
    });
    const resAuth = await parseTRPC(loginRes);
    const authData = resAuth.data as AuthResult;
    teacherToken = authData.accessToken ?? null;
  });

  await test('push.getVapidPublicKey - returns key', async (): Promise<void> => {
    const response = await trpcQuery('push.getVapidPublicKey');
    assert.strictEqual(response.status, 200);
    const res = await parseTRPC(response);
    const data = res.data as VapidResult;
    assert.ok(data.publicKey !== undefined);
    assert.strictEqual(typeof data.publicKey, 'string');
  });

  await test('push.subscribe - setup subscription', async (): Promise<void> => {
    const token = teacherToken ?? '';
    const response = await trpcMutate(
      'push.subscribe',
      {
        subscription: mockSubscription,
        groupIds: ['ciencias-3eso', 'fisica-4eso'],
      },
      { Authorization: `Bearer ${token}` }
    );

    assert.strictEqual(response.status, 200);
    const res = await parseTRPC(response);
    const data = res.data as PushResult;
    assert.ok(data.subscriptionId !== undefined);
    assert.ok(data.groupIds?.includes('ciencias-3eso') === true);
  });

  await test('push.getStatus - gets current status', async (): Promise<void> => {
    const token = teacherToken ?? '';
    const response = await trpcQuery('push.getStatus', undefined, {
      Authorization: `Bearer ${token}`,
    });

    assert.strictEqual(response.status, 200);
    const res = await parseTRPC(response);
    const data = res.data as PushResult;
    assert.strictEqual(data.pushEnabled, true);
    assert.ok(Array.isArray(data.subscriptions));
  });

  await test('push.unsubscribe - removes subscription', async (): Promise<void> => {
    const token = teacherToken ?? '';
    const response = await trpcMutate(
      'push.unsubscribe',
      {
        endpoint: mockSubscription.endpoint,
      },
      { Authorization: `Bearer ${token}` }
    );

    assert.strictEqual(response.status, 200);
    const res = await parseTRPC(response);
    const data = res.data as PushResult;
    assert.strictEqual(data.success, true);
  });

  await test('push.getStatus - verify unsubscribed', async (): Promise<void> => {
    const token = teacherToken ?? '';
    const response = await trpcQuery('push.getStatus', undefined, {
      Authorization: `Bearer ${token}`,
    });

    assert.strictEqual(response.status, 200);
    const res = await parseTRPC(response);
    const data = res.data as PushResult;
    assert.strictEqual(data.subscriptions?.length, 0);
  });

  await describe('Cleanup', async () => {
    await test('should delete teacher user', async (): Promise<void> => {
      const token = adminToken ?? '';
      if (teacherUserId === null) return;

      const response = await trpcMutate(
        'users.delete',
        { id: teacherUserId },
        {
          Authorization: `Bearer ${token}`,
        }
      );
      assert.strictEqual(response.status, 200);
    });
  });
});
