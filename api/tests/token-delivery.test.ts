/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Token Delivery REST API Tests
 *
 * Tests for machine registration and tokenized whitelist download.
 * Run with: npm run test:token-delivery
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import { getAvailablePort, resetDb, trpcMutate as _trpcMutate, parseTRPC } from './test-utils.js';
import { closeConnection, db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

let PORT: number;
let API_URL: string;
let server: Server | undefined;
let registrationToken: string;

const GLOBAL_TIMEOUT = setTimeout(() => {
  console.error('\n❌ Token delivery tests timed out! Forcing exit...');
  process.exit(1);
}, 30000);
GLOBAL_TIMEOUT.unref();

const trpcMutate = (procedure: string, input: unknown): Promise<Response> =>
  _trpcMutate(API_URL, procedure, input);

async function ensureGroupExists(groupId: string): Promise<void> {
  await db.execute(
    sql.raw(`
        INSERT INTO whitelist_groups (id, name, display_name) VALUES ('${groupId}', '${groupId}', '${groupId}')
        ON CONFLICT (id) DO NOTHING
    `)
  );
}

async function createTestClassroom(name: string, groupId: string): Promise<string> {
  await ensureGroupExists(groupId);
  const id = `classroom-${String(Date.now())}`;
  await db.execute(
    sql.raw(`
        INSERT INTO classrooms (id, name, display_name, default_group_id, active_group_id)
        VALUES ('${id}', '${name}', '${name}', '${groupId}', '${groupId}')
    `)
  );
  return id;
}

void describe('Token Delivery REST API Tests', { timeout: 30000 }, async () => {
  before(async () => {
    await resetDb();

    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);
    process.env.SHARED_SECRET = 'test-shared-secret';

    const { app } = await import('../src/server.js');
    server = app.listen(PORT, () => {
      console.log(`Token delivery test server started on port ${String(PORT)}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const adminData = {
      email: `token-admin-${String(Date.now())}@example.com`,
      name: 'Token Test Admin',
      password: 'SecurePassword123!',
    };

    const response = await trpcMutate('setup.createFirstAdmin', adminData);
    const res = await parseTRPC(response);
    const data = res.data as { registrationToken: string };
    registrationToken = data.registrationToken;
  });

  after(async () => {
    await resetDb();

    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          console.log('Token delivery test server closed');
          resolve();
        });
      });
    }
    await closeConnection();
  });

  await describe('POST /api/setup/validate-token', async () => {
    await test('should validate correct registration token', async () => {
      const response = await fetch(`${API_URL}/api/setup/validate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: registrationToken }),
      });

      assert.strictEqual(response.status, 200);
      const data = (await response.json()) as { valid: boolean };
      assert.strictEqual(data.valid, true);
    });

    await test('should reject invalid registration token', async () => {
      const response = await fetch(`${API_URL}/api/setup/validate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid-token' }),
      });

      assert.strictEqual(response.status, 200);
      const data = (await response.json()) as { valid: boolean };
      assert.strictEqual(data.valid, false);
    });

    await test('should return false for missing token', async () => {
      const response = await fetch(`${API_URL}/api/setup/validate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(response.status, 200);
      const data = (await response.json()) as { valid: boolean };
      assert.strictEqual(data.valid, false);
    });
  });

  await describe('POST /api/machines/register', async () => {
    beforeEach(async () => {
      await db.execute(sql.raw('DELETE FROM machines'));
    });

    await test('should register machine and return tokenized URL', async () => {
      await createTestClassroom('TestClassroom', 'test-group');

      const response = await fetch(`${API_URL}/api/machines/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${registrationToken}`,
        },
        body: JSON.stringify({
          hostname: 'test-pc-001',
          classroomName: 'TestClassroom',
          version: '1.0.0',
        }),
      });

      assert.strictEqual(response.status, 200);
      const data = (await response.json()) as { success: boolean; whitelistUrl: string };
      assert.strictEqual(data.success, true);
      assert.ok(data.whitelistUrl.includes('/w/'));
      assert.ok(data.whitelistUrl.includes('/whitelist.txt'));
    });

    await test('should reject without authorization header', async () => {
      const response = await fetch(`${API_URL}/api/machines/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostname: 'test-pc-001',
          classroomName: 'TestClassroom',
        }),
      });

      assert.strictEqual(response.status, 401);
    });

    await test('should reject invalid registration token', async () => {
      const response = await fetch(`${API_URL}/api/machines/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token',
        },
        body: JSON.stringify({
          hostname: 'test-pc-001',
          classroomName: 'TestClassroom',
        }),
      });

      assert.strictEqual(response.status, 403);
    });

    await test('should reject missing hostname', async () => {
      const response = await fetch(`${API_URL}/api/machines/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${registrationToken}`,
        },
        body: JSON.stringify({
          classroomName: 'TestClassroom',
        }),
      });

      assert.strictEqual(response.status, 400);
    });

    await test('should reject non-existent classroom', async () => {
      const response = await fetch(`${API_URL}/api/machines/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${registrationToken}`,
        },
        body: JSON.stringify({
          hostname: 'test-pc-001',
          classroomName: 'NonExistentClassroom',
        }),
      });

      assert.strictEqual(response.status, 404);
    });
  });

  await describe('POST /api/machines/:hostname/rotate-download-token', async () => {
    let machineHostname: string;

    before(async () => {
      await createTestClassroom('RotateTestClassroom', 'rotate-group');

      const response = await fetch(`${API_URL}/api/machines/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${registrationToken}`,
        },
        body: JSON.stringify({
          hostname: 'rotate-test-pc',
          classroomName: 'RotateTestClassroom',
        }),
      });

      assert.strictEqual(response.status, 200);
      machineHostname = 'rotate-test-pc';
    });

    await test('should rotate token and return new URL', async () => {
      const response = await fetch(
        `${API_URL}/api/machines/${machineHostname}/rotate-download-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-shared-secret',
          },
        }
      );

      assert.strictEqual(response.status, 200);
      const data = (await response.json()) as { success: boolean; whitelistUrl: string };
      assert.strictEqual(data.success, true);
      assert.ok(data.whitelistUrl.includes('/w/'));
    });

    await test('should reject without authorization', async () => {
      const response = await fetch(
        `${API_URL}/api/machines/${machineHostname}/rotate-download-token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      assert.strictEqual(response.status, 401);
    });

    await test('should reject invalid shared secret', async () => {
      const response = await fetch(
        `${API_URL}/api/machines/${machineHostname}/rotate-download-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer wrong-secret',
          },
        }
      );

      assert.strictEqual(response.status, 403);
    });

    await test('should reject non-existent machine', async () => {
      const response = await fetch(
        `${API_URL}/api/machines/non-existent-pc/rotate-download-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-shared-secret',
          },
        }
      );

      assert.strictEqual(response.status, 404);
    });
  });

  await describe('GET /w/:machineToken/whitelist.txt', async () => {
    await test('should return fail-open for invalid token', async () => {
      const response = await fetch(`${API_URL}/w/invalid-token-here/whitelist.txt`);

      assert.strictEqual(response.status, 200);
      const text = await response.text();
      assert.ok(text.includes('#DESACTIVADO'));
    });

    await test('should return fail-open for missing token', async () => {
      const response = await fetch(`${API_URL}/w//whitelist.txt`);
      const text = await response.text();
      assert.ok(text.includes('#DESACTIVADO') || response.status !== 200);
    });
  });
});
