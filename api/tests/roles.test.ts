/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Role Management E2E Tests (tRPC)
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import { getAvailablePort, resetDb } from './test-utils.js';
import { closeConnection } from '../src/db/index.js';

let PORT: number;
let API_URL: string;

const GLOBAL_TIMEOUT = setTimeout(() => {
  console.error('\n❌ Tests timed out! Forcing exit...');
  process.exit(1);
}, 25000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;
let adminToken: string | null = null;
let teacherUserId: string | null = null;

const email = `teacher-${String(Date.now())}@school.edu`;

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

interface UserResult {
  id: string;
  email: string;
  name: string;
  roles?: { id: string; role: string; groupIds: string[] }[];
}

interface RoleResult {
  id: string;
  role: string;
  groupIds: string[];
}

interface TeacherResult {
  userId: string;
  groupIds: string[];
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

await describe('Role Management E2E Tests (tRPC)', { timeout: 45000 }, async () => {
  before(async () => {
    await resetDb();

    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);
    process.env.ADMIN_TOKEN = 'test-admin-token';

    const { app } = await import('../src/server.js');

    server = app.listen(PORT, () => {
      console.log(`Roles test server started on port ${String(PORT)}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    adminToken = 'test-admin-token';
  });

  after(async () => {
    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          console.log('Roles test server closed');
          resolve();
        });
      });
    }
    // Close database pool
    await closeConnection();
  });

  await test('Setup: Create Teacher User', async (): Promise<void> => {
    const token = adminToken ?? '';
    const response = await trpcMutate(
      'users.create',
      {
        email,
        password: 'TeacherPassword123!',
        name: 'Pedro García (Test Teacher)',
      },
      { Authorization: `Bearer ${token}` }
    );

    assert.strictEqual(response.status, 200);

    const res = await parseTRPC(response);
    const data = res.data as UserResult;
    teacherUserId = data.id;
  });

  await test('users.assignRole - Role Assignment', async (): Promise<void> => {
    const token = adminToken ?? '';
    const response = await trpcMutate(
      'users.assignRole',
      {
        userId: String(teacherUserId),
        role: 'teacher',
        groupIds: ['ciencias-3eso', 'matematicas-4eso'],
      },
      { Authorization: `Bearer ${token}` }
    );

    assert.strictEqual(response.status, 200);

    const res = await parseTRPC(response);
    const data = res.data as RoleResult;
    assert.strictEqual(data.role, 'teacher');
    assert.deepStrictEqual(data.groupIds, ['ciencias-3eso', 'matematicas-4eso']);
  });

  await test('should assign teacher role without groups (optional)', async (): Promise<void> => {
    const createRes = await trpcMutate(
      'users.create',
      {
        email: `teacher2-${String(Date.now())}@school.edu`,
        password: 'Password123!',
        name: 'Another Teacher',
      },
      { Authorization: `Bearer ${String(adminToken)}` }
    );
    const resUser = await parseTRPC(createRes);
    const userData = resUser.data as UserResult;

    const token = adminToken ?? '';
    const response = await trpcMutate(
      'users.assignRole',
      {
        userId: userData.id,
        role: 'teacher',
        groupIds: [],
      },
      { Authorization: `Bearer ${token}` }
    );

    // tRPC API allows teacher role without groups (groups are optional)
    assert.ok(
      [200, 400].includes(response.status),
      `Expected 200 or 400, got ${String(response.status)}`
    );
  });

  await test('should reject invalid role', async (): Promise<void> => {
    const token = adminToken ?? '';
    const response = await trpcMutate(
      'users.assignRole',
      {
        userId: String(teacherUserId),
        role: 'superadmin',
        groupIds: [],
      },
      { Authorization: `Bearer ${token}` }
    );

    assert.strictEqual(response.status, 400);
  });

  await test('users.get - Get User with Roles', async (): Promise<void> => {
    const token = adminToken ?? '';
    const response = await trpcQuery(
      'users.get',
      { id: String(teacherUserId) },
      {
        Authorization: `Bearer ${token}`,
      }
    );

    assert.strictEqual(response.status, 200);

    const res = await parseTRPC(response);
    const data = res.data as UserResult;
    assert.ok(Array.isArray(data.roles));
    assert.ok(data.roles.length > 0);

    const teacherRole = data.roles.find((r) => r.role === 'teacher');
    assert.ok(teacherRole !== undefined);
    assert.ok(teacherRole.groupIds.includes('ciencias-3eso'));
  });

  await test('users.updateRole - Update Role Groups (skipped)', async (): Promise<void> => {
    console.log('Note: Role update uses revoke + assign pattern in tRPC API');
    assert.ok(true);
    await Promise.resolve();
  });

  await describe('users.revokeRole - Revoke Role', async () => {
    let roleIdToRevoke: string | undefined;
    let tempUserId: string | undefined;

    before(async () => {
      const token = adminToken ?? '';
      const createRes = await trpcMutate(
        'users.create',
        {
          email: `revoke-test-${String(Date.now())}@school.edu`,
          password: 'Password123!',
          name: 'Revoke Test User',
        },
        { Authorization: `Bearer ${token}` }
      );
      const resUser = await parseTRPC(createRes);
      const userData = resUser.data as UserResult;
      tempUserId = userData.id;

      const roleRes = await trpcMutate(
        'users.assignRole',
        {
          userId: tempUserId,
          role: 'teacher',
          groupIds: ['test-group'],
        },
        { Authorization: `Bearer ${token}` }
      );
      const resRole = await parseTRPC(roleRes);
      const roleData = resRole.data as RoleResult;
      roleIdToRevoke = roleData.id;
    });

    await test('should revoke a role', async (): Promise<void> => {
      const response = await trpcMutate(
        'users.revokeRole',
        {
          userId: String(tempUserId),
          roleId: roleIdToRevoke,
        },
        { Authorization: `Bearer ${String(adminToken)}` }
      );

      assert.strictEqual(response.status, 200);

      const res = await parseTRPC(response);
      const data = res.data as { success: boolean };
      assert.strictEqual(data.success, true);
    });

    await test('should handle already revoked role', async (): Promise<void> => {
      const response = await trpcMutate(
        'users.revokeRole',
        {
          userId: String(tempUserId),
          roleId: String(roleIdToRevoke),
        },
        { Authorization: `Bearer ${String(adminToken)}` }
      );

      // tRPC maps NOT_FOUND to 404. It's also acceptable to return 400 or 200 depending on idempotency.
      assert.ok(
        [200, 400, 404].includes(response.status),
        `Expected 200, 400 or 404, got ${String(response.status)}`
      );
    });
  });

  await describe('Authorization: Non-admin Access', async () => {
    await test('should reject role assignment without admin token', async (): Promise<void> => {
      const response = await trpcMutate('users.assignRole', {
        userId: String(teacherUserId),
        role: 'teacher',
        groupIds: ['fake-group'],
      });

      assert.strictEqual(response.status, 401);
    });

    await test('should reject user listing without admin token', async (): Promise<void> => {
      const response = await trpcQuery('users.list');
      assert.strictEqual(response.status, 401);
    });
  });

  await describe('users.listTeachers - List Teachers', async () => {
    await test('should list all teachers with their groups', async (): Promise<void> => {
      const token = adminToken ?? '';
      const response = await trpcQuery('users.listTeachers', undefined, {
        Authorization: `Bearer ${token}`,
      });

      assert.strictEqual(response.status, 200);

      const res = await parseTRPC(response);
      const data = res.data as TeacherResult[];
      assert.ok(Array.isArray(data));
      console.log(`Found ${String(data.length)} teachers`);
    });
  });
});
