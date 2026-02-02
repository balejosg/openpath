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
 * Setup API Tests - First-time admin setup flow (tRPC)
 *
 * Run with: npm run test:setup
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import {
  getAvailablePort,
  resetDb,
  trpcMutate as _trpcMutate,
  trpcQuery as _trpcQuery,
  parseTRPC,
} from './test-utils.js';
import { closeConnection } from '../src/db/index.js';

let PORT: number;
let API_URL: string;

// Global timeout - force exit if tests hang (20s)
const GLOBAL_TIMEOUT = setTimeout(() => {
  console.error('\n❌ Setup tests timed out! Forcing exit...');
  process.exit(1);
}, 20000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;

// Wrap helpers with baseUrl
const trpcMutate = (procedure: string, input: unknown): Promise<Response> =>
  _trpcMutate(API_URL, procedure, input);
const trpcQuery = (procedure: string, input?: unknown): Promise<Response> =>
  _trpcQuery(API_URL, procedure, input);

interface SetupStatusData {
  needsSetup: boolean;
  hasAdmin: boolean;
}

interface FirstAdminData {
  success: boolean;
  registrationToken: string;
  user: { id: string; email: string; name: string };
}

interface ValidateTokenData {
  valid: boolean;
}

void describe('Setup API Tests (tRPC)', { timeout: 30000 }, async () => {
  before(async () => {
    await resetDb();

    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);
    const { app } = await import('../src/server.js');

    server = app.listen(PORT, () => {
      console.log(`Setup test server started on port ${String(PORT)}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  after(async () => {
    await resetDb();

    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          console.log('Setup test server closed');
          resolve();
        });
      });
    }
    await closeConnection();
  });

  // ============================================
  // Setup Status Tests
  // ============================================
  await describe('setup.status', async () => {
    beforeEach(async () => {
      await resetDb();
    });

    await test('should return needsSetup: true when no admins exist', async () => {
      const response = await trpcQuery('setup.status');
      assert.strictEqual(response.status, 200);

      const res = await parseTRPC(response);
      const data = res.data as SetupStatusData;
      assert.strictEqual(data.needsSetup, true);
      assert.strictEqual(data.hasAdmin, false);
    });
  });

  // ============================================
  // First Admin Creation Tests
  // ============================================
  await describe('setup.createFirstAdmin', async () => {
    beforeEach(async () => {
      await resetDb();
    });

    await test('should create first admin and return registration token', async () => {
      const adminData = {
        email: `setup-admin-${String(Date.now())}@example.com`,
        name: 'First Admin',
        password: 'SecurePassword123!',
      };

      const response = await trpcMutate('setup.createFirstAdmin', adminData);
      assert.strictEqual(response.status, 200);

      const res = await parseTRPC(response);
      assert.ok(res.data !== undefined, 'Expected result data');
      const data = res.data as FirstAdminData;
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.registrationToken.length, 64);
      assert.strictEqual(data.user.email, adminData.email.toLowerCase());
    });

    await test('should return needsSetup: false after creating admin', async () => {
      // First create an admin
      const adminData = {
        email: `setup-admin-${String(Date.now())}@example.com`,
        name: 'First Admin',
        password: 'SecurePassword123!',
      };

      await trpcMutate('setup.createFirstAdmin', adminData);

      // Then check status
      const response = await trpcQuery('setup.status');
      const res = await parseTRPC(response);
      const data = res.data as SetupStatusData;

      assert.strictEqual(data.needsSetup, false);
      assert.strictEqual(data.hasAdmin, true);
    });

    await test('should reject second admin creation with FORBIDDEN error', async () => {
      // First create an admin
      const firstAdmin = {
        email: `first-admin-${String(Date.now())}@example.com`,
        name: 'First Admin',
        password: 'SecurePassword123!',
      };

      await trpcMutate('setup.createFirstAdmin', firstAdmin);

      // Try to create a second admin
      const secondAdmin = {
        email: `second-admin-${String(Date.now())}@example.com`,
        name: 'Second Admin',
        password: 'AnotherPassword123!',
      };

      const response = await trpcMutate('setup.createFirstAdmin', secondAdmin);
      // tRPC returns error in body for business errors
      const res = await parseTRPC(response);
      assert.ok(res.error, 'Expected error');
      assert.ok(
        res.error.includes('Setup already completed'),
        `Expected error to include 'Setup already completed', got: ${res.error}`
      );
    });

    await test('should validate required fields', async () => {
      // Missing email - tRPC will return validation error
      const response1 = await trpcMutate('setup.createFirstAdmin', {
        name: 'Test',
        password: 'SecurePassword123!',
      });
      const res1 = await parseTRPC(response1);
      assert.ok(res1.error, 'Expected validation error for missing email');

      // Missing password
      const response2 = await trpcMutate('setup.createFirstAdmin', {
        email: 'test@example.com',
        name: 'Test',
      });
      const res2 = await parseTRPC(response2);
      assert.ok(res2.error, 'Expected validation error for missing password');

      // Short password
      const response3 = await trpcMutate('setup.createFirstAdmin', {
        email: 'test@example.com',
        name: 'Test',
        password: '123',
      });
      const res3 = await parseTRPC(response3);
      assert.ok(res3.error, 'Expected validation error for short password');
    });
  });

  // ============================================
  // Token Validation Tests
  // ============================================
  await describe('setup.validateToken', async () => {
    let validToken: string;

    before(async () => {
      await resetDb();

      // Create first admin to get a valid token
      const adminData = {
        email: `token-test-admin-${String(Date.now())}@example.com`,
        name: 'Token Test Admin',
        password: 'SecurePassword123!',
      };

      const response = await trpcMutate('setup.createFirstAdmin', adminData);
      const res = await parseTRPC(response);
      assert.ok(res.data !== undefined, 'Expected result data');
      const data = res.data as FirstAdminData;
      validToken = data.registrationToken;
    });

    await test('should validate correct token', async () => {
      const response = await trpcMutate('setup.validateToken', {
        token: validToken,
      });

      assert.strictEqual(response.status, 200);
      const res = await parseTRPC(response);
      const data = res.data as ValidateTokenData;
      assert.strictEqual(data.valid, true);
    });

    await test('should reject incorrect token', async () => {
      const response = await trpcMutate('setup.validateToken', {
        token: 'invalid-token-that-is-wrong',
      });

      assert.strictEqual(response.status, 200);
      const res = await parseTRPC(response);
      const data = res.data as ValidateTokenData;
      assert.strictEqual(data.valid, false);
    });

    await test('should require token in request body', async () => {
      const response = await trpcMutate('setup.validateToken', {});
      const res = await parseTRPC(response);
      assert.ok(res.error, 'Expected validation error for missing token');
    });
  });

  // ============================================
  // Admin Token Management Tests
  // ============================================
  await describe('setup.getRegistrationToken', async () => {
    await test('should require admin authentication', async () => {
      // Call without auth - tRPC will return UNAUTHORIZED
      const response = await trpcQuery('setup.getRegistrationToken');
      const res = await parseTRPC(response);
      assert.ok(res.error, 'Expected authentication error');
    });
  });

  await describe('setup.regenerateToken', async () => {
    await test('should require admin authentication', async () => {
      // Call without auth - tRPC will return UNAUTHORIZED
      const response = await trpcMutate('setup.regenerateToken', {});
      const res = await parseTRPC(response);
      assert.ok(res.error, 'Expected authentication error');
    });
  });
});
