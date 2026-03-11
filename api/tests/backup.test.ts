/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Tests for backup router and settings storage
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import { getAvailablePort, trpcQuery, trpcMutate, parseTRPC } from './test-utils.js';
import { closeConnection } from '../src/db/index.js';

let PORT: number;
let API_URL: string;

// Global timeout - force exit if tests hang
const GLOBAL_TIMEOUT = setTimeout(() => {
  console.error('\n❌ Backup tests timed out! Forcing exit...');
  process.exit(1);
}, 25000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;

interface BackupRecordResponse {
  success: boolean;
  recordedAt?: string;
  error?: string;
}

await describe('Backup Router Tests', { timeout: 30000 }, async () => {
  before(async () => {
    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);
    // Set shared secret for testing record endpoint
    process.env.SHARED_SECRET = 'test-backup-secret';

    const { app } = await import('../src/server.js');

    server = app.listen(PORT, () => {
      console.log(`Backup test server started on port ${String(PORT)}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  after(async () => {
    try {
      const { resetTokenStore } = await import('../src/lib/token-store.js');
      resetTokenStore();
    } catch (e) {
      console.error('Error resetting token store:', e);
    }

    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          console.log('Backup test server closed');
          resolve();
        });
      });
    }
    await closeConnection();
  });

  await describe('backup.status', async () => {
    await test('should be removed from the product surface', async () => {
      const response = await trpcQuery(API_URL, 'backup.status');
      assert.strictEqual(response.status, 404);
    });
  });

  await describe('backup.record', async () => {
    await test('should reject without shared secret', async () => {
      const response = await trpcMutate(API_URL, 'backup.record', { status: 'success' });
      assert.strictEqual(response.status, 401, 'Should require shared secret');
    });

    await test('should reject with wrong shared secret', async () => {
      const response = await trpcMutate(
        API_URL,
        'backup.record',
        { status: 'success' },
        { Authorization: 'Bearer wrong-secret' }
      );
      assert.strictEqual(response.status, 401, 'Should reject wrong secret');
    });

    await test('should record successful backup with correct secret', async () => {
      const response = await trpcMutate(
        API_URL,
        'backup.record',
        { status: 'success', sizeBytes: 1024000 },
        { Authorization: 'Bearer test-backup-secret' }
      );
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: BackupRecordResponse };
      assert.ok(data !== undefined, 'Expected data in response');
      assert.strictEqual(data.success, true);
      assert.ok(data.recordedAt !== undefined, 'Should have recordedAt timestamp');
    });

    await test('should record failed backup', async () => {
      const response = await trpcMutate(
        API_URL,
        'backup.record',
        { status: 'failed' },
        { Authorization: 'Bearer test-backup-secret' }
      );
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: BackupRecordResponse };
      assert.ok(data !== undefined, 'Expected data in response');
      assert.strictEqual(data.success, true);
    });

    await test('should validate status enum', async () => {
      const response = await trpcMutate(
        API_URL,
        'backup.record',
        { status: 'invalid' },
        { Authorization: 'Bearer test-backup-secret' }
      );
      assert.strictEqual(response.status, 400, 'Should reject invalid status');
    });
  });

  await describe('removed operational surfaces', async () => {
    await test('healthcheck.systemInfo should be removed from the product surface', async () => {
      const response = await trpcQuery(API_URL, 'healthcheck.systemInfo');
      assert.strictEqual(response.status, 404);
    });
  });
});
