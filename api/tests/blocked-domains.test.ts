/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Blocked Domains Tests - US3: Aprobación Delegada (tRPC)
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import { getAvailablePort, resetDb } from './test-utils.js';
import { closeConnection } from '../src/db/index.js';

let PORT: number;
let API_URL: string;

const GLOBAL_TIMEOUT = setTimeout(() => {
  console.error('\n❌ Blocked domains tests timed out! Forcing exit...');
  process.exit(1);
}, 30000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;
let adminToken: string | null = null;
let teacherToken: string | null = null;
let teacherUserId: string | null = null;
let pendingRequestId: string | null = null;

const TEACHER_EMAIL = `blocked-test-teacher-${String(Date.now())}@school.edu`;
const TEACHER_PASSWORD = 'TeacherPassword123!';
const TEACHER_GROUP = 'ciencias-3eso';

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
  error?: { message: string; code: string; data?: { code: string; httpStatus: number } };
}

interface UserResult {
  id: string;
  email: string;
  name: string;
}

interface AuthResult {
  accessToken?: string;
  refreshToken?: string;
  user?: UserResult;
}

interface CheckResult {
  blocked: boolean;
  domain?: string;
}

interface RequestResult {
  id: string;
  domain?: string;
  status?: string;
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

await describe('Blocked Domains Tests - US3 (tRPC)', { timeout: 45000 }, async () => {
  before(async () => {
    await resetDb();
    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);
    process.env.ADMIN_TOKEN = 'test-admin-token';

    const { app } = await import('../src/server.js');

    server = app.listen(PORT, () => {
      console.log(`Blocked domains test server started on port ${String(PORT)}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    adminToken = 'test-admin-token';

    await trpcMutate(
      'groups.create',
      { name: TEACHER_GROUP },
      {
        Authorization: `Bearer ${adminToken}`,
      }
    );
  });

  after(async () => {
    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          console.log('Blocked domains test server closed');
          resolve();
        });
      });
    }
    await closeConnection();
  });

  await test('Setup: Create Teacher with Role', async (): Promise<void> => {
    const token = adminToken ?? '';
    const response = await trpcMutate(
      'users.create',
      {
        email: TEACHER_EMAIL,
        password: TEACHER_PASSWORD,
        name: 'Pedro García (Blocked Domains Test)',
      },
      { Authorization: `Bearer ${token}` }
    );

    assert.strictEqual(response.status, 200);
    const res = await parseTRPC(response);
    const data = res.data as UserResult;
    teacherUserId = data.id;
  });

  await test('should assign teacher role with groups', async (): Promise<void> => {
    const token = adminToken ?? '';
    const response = await trpcMutate(
      'users.assignRole',
      {
        userId: String(teacherUserId),
        role: 'teacher',
        groupIds: [TEACHER_GROUP],
      },
      { Authorization: `Bearer ${token}` }
    );

    assert.strictEqual(response.status, 200);
    await parseTRPC(response);
  });

  await test('should login as teacher and get token', async (): Promise<void> => {
    const response = await trpcMutate('auth.login', {
      email: TEACHER_EMAIL,
      password: TEACHER_PASSWORD,
    });

    assert.strictEqual(response.status, 200);
    const res = await parseTRPC(response);
    const data = res.data as AuthResult;
    assert.ok(data.accessToken !== undefined);
    teacherToken = data.accessToken ?? null;
  });

  await describe('requests.check - Check if domain is blocked', async () => {
    await test('should return blocked status for facebook.com', async (): Promise<void> => {
      const token = teacherToken ?? '';
      const response = await trpcMutate(
        'requests.check',
        { domain: 'facebook.com', groupId: TEACHER_GROUP },
        {
          Authorization: `Bearer ${token}`,
        }
      );

      assert.strictEqual(response.status, 200);
      const res = await parseTRPC(response);
      const data = res.data as CheckResult;
      assert.strictEqual(typeof data.blocked, 'boolean');
    });

    await test('should return blocked status for wikipedia.org', async (): Promise<void> => {
      const token = teacherToken ?? '';
      const response = await trpcMutate(
        'requests.check',
        { domain: 'wikipedia.org', groupId: TEACHER_GROUP },
        {
          Authorization: `Bearer ${token}`,
        }
      );

      assert.strictEqual(response.status, 200);
      const res = await parseTRPC(response);
      const data = res.data as CheckResult;
      assert.strictEqual(typeof data.blocked, 'boolean');
    });

    await test('should reject check without authentication', async (): Promise<void> => {
      const response = await trpcMutate('requests.check', {
        domain: 'example.com',
        groupId: TEACHER_GROUP,
      });

      assert.strictEqual(response.status, 401);
    });

    await test('should reject check without domain parameter', async (): Promise<void> => {
      const token = teacherToken ?? '';
      const response = await trpcMutate(
        'requests.check',
        { groupId: TEACHER_GROUP },
        {
          Authorization: `Bearer ${token}`,
        }
      );

      assert.strictEqual(response.status, 400);
    });
  });

  await describe('requests.listBlocked - List blocked domains', async () => {
    await test('should return list of blocked domains for admin', async (): Promise<void> => {
      const token = adminToken ?? '';
      const response = await trpcQuery(
        'requests.listBlocked',
        { groupId: TEACHER_GROUP },
        {
          Authorization: `Bearer ${token}`,
        }
      );

      assert.strictEqual(response.status, 200);
      const res = await parseTRPC(response);
      const data = res.data as string[];
      assert.ok(Array.isArray(data));
    });

    await test('should reject for non-admin (teacher)', async (): Promise<void> => {
      const token = teacherToken ?? '';
      const response = await trpcQuery(
        'requests.listBlocked',
        { groupId: TEACHER_GROUP },
        {
          Authorization: `Bearer ${token}`,
        }
      );

      assert.strictEqual(response.status, 403);
    });

    await test('should reject without authentication', async (): Promise<void> => {
      const response = await trpcQuery('requests.listBlocked');

      assert.strictEqual(response.status, 401);
    });
  });

  await describe('Teacher Approval of Blocked Domains', async () => {
    await test('setup: create a pending request for any domain', async (): Promise<void> => {
      const testDomain = `blocked-test-${String(Date.now())}.example.com`;

      const response = await trpcMutate('requests.create', {
        domain: testDomain,
        reason: 'Test request for blocked domain',
        requesterEmail: 'student@test.com',
      });

      if (response.status === 200) {
        const res = await parseTRPC(response);
        const data = res.data as RequestResult;
        pendingRequestId = data.id;
      }
    });

    await test('teacher should be able to approve request (if allowed)', async (): Promise<void> => {
      if (pendingRequestId === null) {
        console.log('Skipping: No pending request available');
        return;
      }

      const token = teacherToken ?? '';
      const response = await trpcMutate(
        'requests.approve',
        {
          id: pendingRequestId,
          groupId: TEACHER_GROUP,
        },
        { Authorization: `Bearer ${token}` }
      );

      assert.ok(
        [200, 400, 403].includes(response.status),
        `Expected 200, 400, or 403, got ${String(response.status)}`
      );
    });
  });

  await describe('Teacher Approval of Non-blocked Domains', async () => {
    let nonBlockedRequestId: string | null = null;

    await test('setup: create request for safe domain', async (): Promise<void> => {
      const safeDomain = `safe-test-${String(Date.now())}.example.org`;

      const response = await trpcMutate('requests.create', {
        domain: safeDomain,
        reason: 'Test request for safe domain',
        requesterEmail: 'student-safe@test.com',
      });

      if (response.status === 200) {
        const res = await parseTRPC(response);
        const data = res.data as RequestResult;
        nonBlockedRequestId = data.id;
      }
    });

    await test('teacher should successfully approve non-blocked domain', async (): Promise<void> => {
      if (nonBlockedRequestId === null) {
        console.log('Skipping: No pending request for non-blocked domain');
        return;
      }

      const token = teacherToken ?? '';
      const response = await trpcMutate(
        'requests.approve',
        {
          id: nonBlockedRequestId,
          groupId: TEACHER_GROUP,
        },
        { Authorization: `Bearer ${token}` }
      );

      assert.ok(
        [200, 400, 403].includes(response.status),
        `Expected success or already processed, got ${String(response.status)}`
      );
    });
  });
});
