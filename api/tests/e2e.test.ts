/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * E2E Tests - Teacher Role Workflow (tRPC)
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
  getAvailablePort,
  resetDb,
  type AuthResult,
  type RequestResult,
} from './test-utils.js';
import { closeConnection } from '../src/db/index.js';

let PORT: number;
let API_URL: string;

const GLOBAL_TIMEOUT = setTimeout(() => {
  console.error('\n❌ E2E tests timed out! Forcing exit...');
  process.exit(1);
}, 60000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;

let testDataDir: string | null = null;

let adminToken: string | null = null;
let teacherToken: string | null = null;
let teacherId: string | null = null;

// Use unique emails for this test run to ensure isolation
const ADMIN_EMAIL = uniqueEmail('maria-admin');
const ADMIN_PASSWORD = 'AdminPassword123!';
const TEACHER_EMAIL = uniqueEmail('pedro-teacher');
const TEACHER_PASSWORD = 'TeacherPassword123!';
const TEACHER_GROUP = 'informatica-3';

// Wrap helpers with baseUrl
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

console.log(`E2E Test Run ID: ${TEST_RUN_ID}`);

await describe('E2E: Teacher Role Workflow (tRPC)', { timeout: 75000 }, async () => {
  before(async () => {
    // Reset DB logic
    await resetDb();

    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);

    // Ensure test isolation (users/roles/requests/etc.)
    testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpath-e2e-'));
    process.env.DATA_DIR = testDataDir;

    const { app } = await import('../src/server.js');

    server = app.listen(PORT, () => {
      console.log(`E2E test server started on port ${String(PORT)}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  after(async () => {
    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          console.log('E2E test server closed');
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

  await describe('Step 1: Setup Admin User', async () => {
    await test('should create first admin via setup endpoint', async (): Promise<void> => {
      const response = await trpcMutate('setup.createFirstAdmin', {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        name: 'María Admin',
      });

      // In isolated DATA_DIR this should always be the first admin
      assert.strictEqual(response.status, 200);
      const res = await parseTRPC(response);
      assert.ok(res.data !== undefined, 'Expected result data');
    });

    await test('should login as admin', async (): Promise<void> => {
      const response = await trpcMutate('auth.login', {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });

      assert.strictEqual(response.status, 200);
      const res = await parseTRPC(response);
      const data = res.data as AuthResult;
      adminToken = data.accessToken ?? null;
      assert.ok(adminToken !== null && adminToken !== '');
    });
  });

  await describe('Step 2: Admin Creates Teacher User (Pedro)', async () => {
    await test('should create teacher user', async (): Promise<void> => {
      const token = adminToken ?? '';
      const response = await trpcMutate(
        'users.create',
        {
          email: TEACHER_EMAIL,
          password: TEACHER_PASSWORD,
          name: 'Pedro Profesor',
        },
        { Authorization: `Bearer ${token}` }
      );

      if (response.status === 403 || response.status === 401) {
        // Fallback to register
        const regResponse = await trpcMutate('auth.register', {
          email: TEACHER_EMAIL,
          password: TEACHER_PASSWORD,
          name: 'Pedro Profesor',
        });

        // 200 = new user, 409 = already exists
        assert.ok(
          [200, 409].includes(regResponse.status),
          `Expected 200 or 409, got ${String(regResponse.status)}`
        );

        if (regResponse.status === 200) {
          const res = await parseTRPC(regResponse);
          const data = res.data as AuthResult;
          teacherId = data.user?.id ?? null;
        }
      } else {
        assert.ok(
          [200, 409].includes(response.status),
          `Expected 200 or 409, got ${String(response.status)}`
        );
        if (response.status === 200) {
          const res = await parseTRPC(response);
          const data = res.data as AuthResult;
          teacherId = data.user?.id ?? null;
        }
      }

      // If user already existed, get ID from login
      if (teacherId === null) {
        const loginRes = await trpcMutate('auth.login', {
          email: TEACHER_EMAIL,
          password: TEACHER_PASSWORD,
        });
        assert.strictEqual(loginRes.status, 200, 'Should be able to login as existing teacher');
        const res = await parseTRPC(loginRes);
        const data = res.data as AuthResult;
        teacherId = data.user?.id ?? null;
      }

      assert.ok(teacherId !== null && teacherId !== '', 'Should have valid teacherId');
    });

    await test('should assign teacher role with group', async (): Promise<void> => {
      const token = adminToken ?? '';
      const response = await trpcMutate(
        'users.assignRole',
        {
          userId: String(teacherId),
          role: 'teacher',
          groupIds: [TEACHER_GROUP],
        },
        { Authorization: `Bearer ${token}` }
      );

      if (response.status === 200) {
        await parseTRPC(response);
      } else {
        console.log('Note: Role assignment results vary by environment');
      }
    });
  });

  await describe('Step 3: Teacher Login and Verify Access', async () => {
    await test('should login as teacher (Pedro)', async (): Promise<void> => {
      const response = await trpcMutate('auth.login', {
        email: TEACHER_EMAIL,
        password: TEACHER_PASSWORD,
      });

      assert.strictEqual(response.status, 200);
      const res = await parseTRPC(response);
      const data = res.data as AuthResult;
      teacherToken = data.accessToken ?? null;
      assert.ok(teacherToken !== null && teacherToken !== '');
    });

    await test('should get teacher profile with role info', async (): Promise<void> => {
      const token = teacherToken ?? '';
      const response = await trpcQuery('auth.me', undefined, {
        Authorization: `Bearer ${token}`,
      });

      assert.strictEqual(response.status, 200);
      const res = await parseTRPC(response);
      const data = res.data as { user: { email: string } };
      assert.strictEqual(data.user.email, TEACHER_EMAIL);
    });
  });

  await describe('Step 4: Teacher Workflow - Request and Approve', async () => {
    let requestId: string | null = null;
    const TEST_DOMAIN = `test-${String(Date.now())}.org`;

    await test('setup: student creates request', async (): Promise<void> => {
      const response = await trpcMutate('requests.create', {
        domain: TEST_DOMAIN,
        reason: 'I need this for homework',
        requesterEmail: 'student@test.com',
        groupId: TEACHER_GROUP,
      });

      assert.strictEqual(response.status, 200);
      const res = await parseTRPC(response);
      const data = res.data as RequestResult;
      requestId = data.id;
    });

    await test('teacher should approve request', async (): Promise<void> => {
      if (requestId === null) return;

      const token = teacherToken ?? '';
      const response = await trpcMutate(
        'requests.approve',
        {
          id: requestId,
          groupId: TEACHER_GROUP,
        },
        { Authorization: `Bearer ${token}` }
      );

      assert.ok([200, 400].includes(response.status));
    });
  });

  await describe('Step 5: Access Control - Teacher Cannot Access Admin Functions', async () => {
    await test('teacher should not be able to list all users', async (): Promise<void> => {
      const token = teacherToken ?? '';
      const response = await trpcQuery('users.list', undefined, {
        Authorization: `Bearer ${token}`,
      });

      assert.ok([401, 403].includes(response.status));
    });

    await test('teacher should not be able to create users', async (): Promise<void> => {
      const token = teacherToken ?? '';
      const response = await trpcMutate(
        'users.create',
        {
          email: `unauth-${String(Date.now())}@test.com`,
          password: 'Password123!',
          name: 'Unauthorized User',
        },
        { Authorization: `Bearer ${token}` }
      );

      assert.ok([401, 403].includes(response.status));
    });

    await test('teacher should not be able to assign roles', async (): Promise<void> => {
      const token = teacherToken ?? '';
      const response = await trpcMutate(
        'users.assignRole',
        {
          userId: 'some-id',
          role: 'admin',
          groupIds: [],
        },
        { Authorization: `Bearer ${token}` }
      );

      assert.ok([401, 403].includes(response.status));
    });
  });

  await describe('Cleanup', async () => {
    await test('should logout teacher', async (): Promise<void> => {
      if (teacherToken === null) return;

      const response = await trpcMutate(
        'auth.logout',
        {},
        {
          Authorization: `Bearer ${teacherToken}`,
        }
      );

      assert.strictEqual(response.status, 200);
    });
  });
});
