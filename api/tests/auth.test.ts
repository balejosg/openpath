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
import { OAuth2Client, type LoginTicket } from 'google-auth-library';
import { getAvailablePort, resetDb } from './test-utils.js';
import { closeConnection } from '../src/db/index.js';
import { loadConfig } from '../src/config.js';
import * as authLib from '../src/lib/auth.js';
import * as userStorage from '../src/lib/user-storage.js';

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
  user?: { id: string; email: string; name: string; roles?: { role: string }[] };
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  sessionTransport?: 'token' | 'cookie';
  verificationRequired?: boolean;
  verificationToken?: string;
  verificationExpiresAt?: string;
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
      await resetDb();

      PORT = await getAvailablePort();
      API_URL = `http://localhost:${String(PORT)}`;
      process.env.PORT = String(PORT);
      const { config } = await import('../src/config.js');
      (config as { googleClientId: string }).googleClientId = 'test-google-client-id';
      const { app } = await import('../src/server.js');

      server = app.listen(PORT, () => {
        console.log(`Auth test server started on port ${String(PORT)}`);
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const setupResponse = await trpcMutate('setup.createFirstAdmin', {
        email: `bootstrap-admin-${String(Date.now())}@example.com`,
        password: 'SecurePassword123!',
        name: 'Bootstrap Admin',
      });
      assert.strictEqual(setupResponse.status, 200);
    });

    after(async () => {
      await resetDb();

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
        assert.deepStrictEqual(data.user.roles ?? [], []);
        assert.strictEqual(data.verificationRequired, true);
        assert.strictEqual(
          data.verificationToken,
          undefined,
          'public registration should not expose verification tokens'
        );
        assert.strictEqual(
          data.verificationExpiresAt,
          undefined,
          'public registration should not expose verification expiry'
        );
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

    await describe('tRPC auth.generateEmailVerificationToken - Restricted issuance', async () => {
      const adminAccessToken = authLib.generateTokens(
        {
          id: 'legacy_admin',
          email: 'admin@openpath.dev',
          name: 'Legacy Admin',
          passwordHash: 'placeholder',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isActive: true,
        },
        [{ role: 'admin', groupIds: [] }]
      ).accessToken;

      await test('should reject unauthenticated email verification issuance', async () => {
        const email = `verify-public-${String(Date.now())}@example.com`;
        await userStorage.createUser(
          {
            email,
            password: 'SecurePassword123!',
            name: 'Verification Public User',
          },
          { emailVerified: false }
        );

        const response = await trpcMutate('auth.generateEmailVerificationToken', { email });
        assert.strictEqual(response.status, 401);
      });

      await test('should allow admins to issue a verification token for an unverified user', async () => {
        const email = `verify-admin-${String(Date.now())}@example.com`;
        await userStorage.createUser(
          {
            email,
            password: 'SecurePassword123!',
            name: 'Verification Admin User',
          },
          { emailVerified: false }
        );

        const response = await trpcMutate(
          'auth.generateEmailVerificationToken',
          { email },
          { Authorization: `Bearer ${adminAccessToken}` }
        );
        assert.strictEqual(response.status, 200);

        const { data } = (await parseTRPC(response)) as {
          data?: {
            email?: string;
            verificationRequired?: boolean;
            verificationToken?: string;
            verificationExpiresAt?: string;
          };
        };
        assert.ok(data);
        assert.strictEqual(data.email, email);
        assert.strictEqual(data.verificationRequired, true);
        assert.ok(data.verificationToken);
        assert.ok(data.verificationExpiresAt);
      });
    });

    await describe('tRPC auth.googleLogin - Existing users only', async () => {
      async function withStubbedGooglePayload(
        payload: { email?: string; sub?: string; name?: string },
        run: () => Promise<void>
      ): Promise<void> {
        const originalVerifyIdToken = Reflect.get(OAuth2Client.prototype, 'verifyIdToken');
        const verifyIdTokenStub = (): Promise<LoginTicket> =>
          Promise.resolve({
            getPayload: (): { email?: string; sub?: string; name?: string } => payload,
          } as unknown as LoginTicket);
        OAuth2Client.prototype.verifyIdToken =
          verifyIdTokenStub as unknown as typeof OAuth2Client.prototype.verifyIdToken;

        try {
          await run();
        } finally {
          OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
        }
      }

      await test('should link Google login to an existing account instead of provisioning a new one', async () => {
        const email = `google-existing-${String(Date.now())}@example.com`;
        const googleId = `google-existing-${String(Date.now())}`;
        await userStorage.createUser(
          {
            email,
            password: 'SecurePassword123!',
            name: 'Existing Google User',
          },
          { emailVerified: false }
        );

        await withStubbedGooglePayload(
          { email, sub: googleId, name: 'Existing Google User' },
          async () => {
            const response = await trpcMutate('auth.googleLogin', { idToken: 'fake-google-token' });
            assert.strictEqual(response.status, 200);

            const { data } = (await parseTRPC(response)) as { data?: AuthResult };
            const user = data?.user;
            if (!user) {
              throw new Error('Expected google login to return a user');
            }
            assert.strictEqual(user.email, email);

            const storedUser = await userStorage.getUserByEmail(email);
            if (!storedUser) {
              throw new Error('Expected existing user to remain in storage');
            }
            assert.strictEqual(storedUser.googleId, googleId);
            assert.strictEqual(storedUser.emailVerified, true);
          }
        );
      });

      await test('should reject unknown Google accounts instead of auto-provisioning them', async () => {
        const email = `google-unknown-${String(Date.now())}@example.com`;

        await withStubbedGooglePayload(
          { email, sub: `google-unknown-${String(Date.now())}`, name: 'Unknown Google User' },
          async () => {
            const response = await trpcMutate('auth.googleLogin', { idToken: 'fake-google-token' });
            assert.strictEqual(response.status, 403);

            const { error } = await parseTRPC(response);
            assert.match(error ?? '', /existing|preapproved/i);
          }
        );

        const storedUser = await userStorage.getUserByEmail(email);
        assert.strictEqual(storedUser, null);
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
        await userStorage.createUser(
          {
            email: testEmail,
            password: testPassword,
            name: 'Login Test User',
          },
          { emailVerified: true }
        );
      });

      await test('should login with valid credentials', async () => {
        const response = await trpcMutate('auth.login', {
          email: testEmail,
          password: testPassword,
        });

        assert.strictEqual(response.status, 200);
        const { data } = (await parseTRPC(response)) as { data?: AuthResult };
        if (!data) throw new Error('No data');
        assert.ok(data.accessToken !== undefined && data.accessToken !== '');
        assert.ok(data.refreshToken !== undefined && data.refreshToken !== '');
        assert.strictEqual(typeof data.expiresIn, 'number');
        assert.ok((data.expiresIn ?? 0) > 0);
        assert.strictEqual(data.sessionTransport, 'token');
        assert.ok(data.user !== undefined);
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

        await userStorage.createUser(
          {
            email,
            password: 'SecurePassword123!',
            name: 'Refresh Test User',
          },
          { emailVerified: true }
        );

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
        assert.strictEqual(response.status, 200);
        const { data } = (await parseTRPC(response)) as { data?: AuthResult };
        if (!data) throw new Error('No data');
        assert.ok(data.accessToken);
        assert.ok(data.refreshToken);
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

      await test('should use the deterministic test JWT secret fallback when unset', async () => {
        const config = loadConfig({
          ...process.env,
          NODE_ENV: 'test',
          JWT_SECRET: undefined,
        });

        assert.strictEqual(config.jwtSecret, 'openpath-test-secret');
      });

      await test('should reject request with invalid token', async () => {
        const response = await trpcQuery('auth.me', undefined, {
          Authorization: 'Bearer invalid-token',
        });
        assert.strictEqual(response.status, 401);
      });

      await test('should allow admin routes with a bearer JWT', async () => {
        const accessToken = authLib.generateTokens(
          {
            id: 'legacy_admin',
            email: 'admin@openpath.dev',
            name: 'Legacy Admin',
            passwordHash: 'placeholder',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: true,
          },
          [{ role: 'admin', groupIds: [] }]
        ).accessToken;

        const response = await trpcQuery('users.list', undefined, {
          Authorization: `Bearer ${accessToken}`,
        });

        assert.strictEqual(response.status, 200);
      });

      await test('should allow admin routes with a cookie-backed access token', async () => {
        const accessToken = authLib.generateTokens(
          {
            id: 'legacy_admin',
            email: 'admin@openpath.dev',
            name: 'Legacy Admin',
            passwordHash: 'placeholder',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: true,
          },
          [{ role: 'admin', groupIds: [] }]
        ).accessToken;

        const previousCookieName = process.env.OPENPATH_ACCESS_TOKEN_COOKIE_NAME;
        process.env.OPENPATH_ACCESS_TOKEN_COOKIE_NAME = 'op_access';

        try {
          const response = await trpcQuery('users.list', undefined, {
            Cookie: `op_access=${encodeURIComponent(accessToken)}`,
          });

          assert.strictEqual(response.status, 200);
        } finally {
          if (previousCookieName === undefined) {
            delete process.env.OPENPATH_ACCESS_TOKEN_COOKIE_NAME;
          } else {
            process.env.OPENPATH_ACCESS_TOKEN_COOKIE_NAME = previousCookieName;
          }
        }
      });
    });

    // ============================================
    // Change Password Tests
    // ============================================
    await describe('tRPC auth.changePassword - Change Password', async () => {
      let testEmail: string;
      let currentPassword: string;
      let newPassword: string;
      let accessToken: string;

      before(async () => {
        testEmail = `change-password-${String(Date.now())}-${Math.random().toString(36).slice(2)}@example.com`;
        currentPassword = 'CurrentPassword123!';
        newPassword = 'NewPassword456!';

        await userStorage.createUser(
          {
            email: testEmail,
            password: currentPassword,
            name: 'Change Password User',
          },
          { emailVerified: true }
        );

        const user = await userStorage.getUserByEmail(testEmail);
        if (!user) {
          throw new Error('Expected created user to exist');
        }
        accessToken = authLib.generateTokens(user, []).accessToken;
      });

      await test('should require authentication', async () => {
        const response = await trpcMutate('auth.changePassword', {
          currentPassword,
          newPassword,
        });

        assert.strictEqual(response.status, 401);
      });

      await test('should reject wrong current password', async () => {
        const response = await trpcMutate(
          'auth.changePassword',
          {
            currentPassword: 'WrongCurrentPassword123!',
            newPassword,
          },
          { Authorization: `Bearer ${accessToken}` }
        );

        assert.strictEqual(response.status, 400);
      });

      await test('should change password and invalidate old credentials', async () => {
        const changeResponse = await trpcMutate(
          'auth.changePassword',
          {
            currentPassword,
            newPassword,
          },
          { Authorization: `Bearer ${accessToken}` }
        );

        assert.strictEqual(changeResponse.status, 200);

        const oldLoginResponse = await trpcMutate('auth.login', {
          email: testEmail,
          password: currentPassword,
        });
        assert.ok([401, 429].includes(oldLoginResponse.status));

        const newLoginResponse = await trpcMutate('auth.login', {
          email: testEmail,
          password: newPassword,
        });
        assert.strictEqual(newLoginResponse.status, 200);
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
        await userStorage.createUser(
          {
            email,
            password: pwd,
            name: 'Logout User',
          },
          { emailVerified: true }
        );
        const user = await userStorage.getUserByEmail(email);
        if (!user) {
          throw new Error('Expected created user to exist');
        }
        accessToken = authLib.generateTokens(user, []).accessToken;
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
