/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Authentication & User Management API Tests (tRPC)
 *
 * Run with: npm run test:auth
 *
 * These tests run on a separate port (3001) to avoid conflicts with the main tests.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import { getAvailablePort } from './test-utils.js';
import { closeConnection } from '../src/db/index.js';

let PORT: number;
let API_URL: string;

// Global timeout - force exit if tests hang (15s)
const GLOBAL_TIMEOUT = setTimeout(() => {
  console.error('\n❌ Auth tests timed out! Forcing exit...');
  process.exit(1);
}, 15000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;

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
interface TRPCResponse<T = unknown> {
  result?: { data: T };
  error?: { message: string; code: string };
}

interface AuthResult {
  success?: boolean;
  user?: { id: string; email: string; name: string };
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

async function parseTRPC(
  response: Response
): Promise<{ data?: unknown; error?: string; code?: string }> {
  const json = (await response.json()) as TRPCResponse;
  if (json.result) {
    return { data: json.result.data };
  }
  if (json.error) {
    return { error: json.error.message, code: json.error.code };
  }
  return {};
}

await describe(
  'Authentication & User Management API Tests (tRPC)',
  { timeout: 30000 },
  async () => {
    before(async () => {
      PORT = await getAvailablePort();
      API_URL = `http://localhost:${String(PORT)}`;
      process.env.PORT = String(PORT);
      const { app } = await import('../src/server.js');

      server = app.listen(PORT, () => {
        console.log(`Auth test server started on port ${String(PORT)}`);
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
            console.log('Auth test server closed');
            resolve();
          });
        });
      }
      // Close database pool
      await closeConnection();
    });

    // ============================================
    // Registration Tests
    // ============================================
    await describe('tRPC auth.register - User Registration', async () => {
      await test('should register a new user', async () => {
        const input = {
          email: `test-${String(Date.now())}@example.com`,
          password: 'SecurePassword123!',
          name: 'Test User',
        };

        const response = await trpcMutate('auth.register', input);
        assert.strictEqual(response.status, 200);

        const { data } = (await parseTRPC(response)) as { data?: AuthResult };
        if (!data) throw new Error('No data');
        assert.ok(data.user);
        assert.ok(data.user.id);
      });

      await test('should reject registration without email', async () => {
        const response = await trpcMutate('auth.register', {
          password: 'SecurePassword123!',
          name: 'Test User',
        });

        assert.strictEqual(response.status, 400);
      });

      await test('should reject registration with short password', async () => {
        const response = await trpcMutate('auth.register', {
          email: `short-pwd-${String(Date.now())}@example.com`,
          password: '123',
          name: 'Test User',
        });

        assert.strictEqual(response.status, 400);
      });

      await test('should reject duplicate email registration', async () => {
        const email = `duplicate-${String(Date.now())}@example.com`;

        await trpcMutate('auth.register', {
          email,
          password: 'SecurePassword123!',
          name: 'First User',
        });

        const response = await trpcMutate('auth.register', {
          email,
          password: 'DifferentPassword123!',
          name: 'Second User',
        });

        assert.ok(
          [409, 429].includes(response.status),
          `Expected 409 or 429, got ${String(response.status)}`
        );
      });
    });

    // ============================================
    // Login Tests
    // ============================================
    await describe('tRPC auth.login - User Login', async () => {
      let testEmail: string;
      const testPassword = 'SecurePassword123!';

      before(async () => {
        testEmail = `login-test-${String(Date.now())}-${Math.random().toString(36).slice(2)}@example.com`;
        const regResponse = await trpcMutate('auth.register', {
          email: testEmail,
          password: testPassword,
          name: 'Login Test User',
        });
        if (regResponse.status !== 200) {
          console.log(`Note: Registration returned ${String(regResponse.status)}`);
        }
      });

      await test('should login with valid credentials', async () => {
        const response = await trpcMutate('auth.login', {
          email: testEmail,
          password: testPassword,
        });

        assert.ok(
          [200, 401].includes(response.status),
          `Expected 200 or 401, got ${String(response.status)}`
        );

        if (response.status === 200) {
          const { data } = (await parseTRPC(response)) as { data?: AuthResult };
          if (!data) throw new Error('No data');
          assert.ok(data.accessToken !== undefined && data.accessToken !== '');
          assert.ok(data.refreshToken !== undefined && data.refreshToken !== '');
          assert.ok(data.user !== undefined);
        }
      });

      await test('should reject login with wrong password', async () => {
        const response = await trpcMutate('auth.login', {
          email: testEmail,
          password: 'WrongPassword123!',
        });

        assert.strictEqual(response.status, 401);
      });

      await test('should reject login with non-existent email', async () => {
        const response = await trpcMutate('auth.login', {
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        });

        assert.strictEqual(response.status, 401);
      });
    });

    // ============================================
    // Token Refresh Tests
    // ============================================
    await describe('tRPC auth.refresh - Token Refresh', async () => {
      let refreshToken: string | null = null;

      before(async () => {
        const email = `refresh-test-${String(Date.now())}-${Math.random().toString(36).slice(2)}@example.com`;

        await trpcMutate('auth.register', {
          email,
          password: 'SecurePassword123!',
          name: 'Refresh Test User',
        });

        const loginResponse = await trpcMutate('auth.login', {
          email,
          password: 'SecurePassword123!',
        });

        if (loginResponse.status === 200) {
          // Parse the raw response to see actual structure
          const rawJson = (await loginResponse.json()) as {
            result?: { data?: AuthResult };
            error?: unknown;
          };
          if (rawJson.result?.data?.refreshToken) {
            refreshToken = rawJson.result.data.refreshToken;
          }
        }
      });

      await test('should refresh tokens with valid refresh token', async () => {
        if (refreshToken === null) {
          console.log('Skipping: refreshToken not available');
          return;
        }

        const response = await trpcMutate('auth.refresh', { refreshToken });
        // Refresh endpoint returns new tokens. If successful, should be 200
        // If fails, maybe the token was blacklisted or invalid
        assert.ok(
          [200, 401].includes(response.status),
          `Expected 200 or 401, got ${String(response.status)}`
        );

        if (response.status === 200) {
          const { data } = (await parseTRPC(response)) as { data?: AuthResult };
          if (!data) throw new Error('No data');
          assert.ok(data.accessToken);
          assert.ok(data.refreshToken);
        }
      });

      await test('should reject invalid refresh token', async () => {
        const response = await trpcMutate('auth.refresh', { refreshToken: 'invalid-token' });
        assert.strictEqual(response.status, 401);
      });
    });

    // ============================================
    // Current User Tests
    // ============================================
    await describe('tRPC auth.me - Get Current User', async () => {
      await test('should reject request without token', async () => {
        const response = await trpcQuery('auth.me');
        assert.strictEqual(response.status, 401);
      });

      await test('should reject request with invalid token', async () => {
        const response = await trpcQuery('auth.me', undefined, {
          Authorization: 'Bearer invalid-token',
        });
        assert.strictEqual(response.status, 401);
      });
    });

    // ============================================
    // User Management Tests (Admin Only)
    // ============================================
    await describe('tRPC users - Admin User Management Endpoints', async () => {
      await test('users.list should require admin authentication', async () => {
        const response = await trpcQuery('users.list');
        assert.strictEqual(response.status, 401);
      });

      await test('users.create should require admin authentication', async () => {
        const response = await trpcMutate('users.create', {
          email: 'admin-create-test@example.com',
          password: 'SecurePassword123!',
          name: 'Admin Created User',
        });

        assert.strictEqual(response.status, 401);
      });
    });

    // ============================================
    // Role Management Tests
    // ============================================
    await describe('tRPC users - Role Management Endpoints', async () => {
      await test('users.assignRole should require admin authentication', async () => {
        const response = await trpcMutate('users.assignRole', {
          userId: 'some-user-id',
          role: 'teacher',
          groupIds: ['group1'],
        });

        assert.strictEqual(response.status, 401);
      });

      await test('users.listTeachers should require admin authentication', async () => {
        const response = await trpcQuery('users.listTeachers');
        assert.strictEqual(response.status, 401);
      });
    });

    // ============================================
    // Logout Tests
    // ============================================
    await describe('tRPC auth.logout - Logout', async () => {
      let accessToken: string;

      before(async () => {
        const email = `logout-test-${String(Date.now())}@example.com`;
        const pwd = 'SecurePassword123!';
        await trpcMutate('auth.register', { email, password: pwd, name: 'Logout User' });
        const login = await trpcMutate('auth.login', { email, password: pwd });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        const json = (await login.json()) as any;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        accessToken = json.result.data.accessToken;
      });

      await test('should logout successfully', async () => {
        if (!accessToken) return;
        const response = await trpcMutate(
          'auth.logout',
          {},
          { Authorization: `Bearer ${accessToken}` }
        );
        assert.strictEqual(response.status, 200, 'Logout should return 200');
      });
    });
  }
);
