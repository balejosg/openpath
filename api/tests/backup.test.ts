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

// Response types
interface BackupStatusResponse {
  lastBackupAt: string | null;
  lastBackupHuman: string | null;
  lastBackupSize: string | null;
  lastBackupSizeHuman: string | null;
  lastBackupStatus: 'success' | 'failed' | null;
}

interface BackupRecordResponse {
  success: boolean;
  recordedAt?: string;
  error?: string;
}

interface SystemInfoResponse {
  version: string;
  database: { connected: boolean; type: string };
  session: {
    accessTokenExpiry: string;
    accessTokenExpiryHuman: string;
    refreshTokenExpiry: string;
    refreshTokenExpiryHuman: string;
  };
  backup: {
    lastBackupAt: string | null;
    lastBackupHuman: string | null;
    lastBackupStatus: 'success' | 'failed' | null;
  };
  uptime: number;
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
    await test('should return backup status (public endpoint)', async () => {
      const response = await trpcQuery(API_URL, 'backup.status');
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: BackupStatusResponse };
      assert.ok(data !== undefined, 'Expected data in response');

      // Check structure exists (values may be null if no backup recorded)
      assert.ok('lastBackupAt' in data, 'Should have lastBackupAt');
      assert.ok('lastBackupHuman' in data, 'Should have lastBackupHuman');
      assert.ok('lastBackupSize' in data, 'Should have lastBackupSize');
      assert.ok('lastBackupSizeHuman' in data, 'Should have lastBackupSizeHuman');
      assert.ok('lastBackupStatus' in data, 'Should have lastBackupStatus');
    });

    await test('should be accessible without authentication', async () => {
      const response = await trpcQuery(API_URL, 'backup.status');
      assert.strictEqual(response.status, 200, 'Should be accessible without auth');

      const { error } = await parseTRPC(response);
      assert.ok(error === undefined, 'Should not return auth error');
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

  await describe('backup status after recording', async () => {
    await test('should show recorded backup in status', async () => {
      // First record a backup
      await trpcMutate(
        API_URL,
        'backup.record',
        { status: 'success', sizeBytes: 2048000 },
        { Authorization: 'Bearer test-backup-secret' }
      );

      // Then check status
      const response = await trpcQuery(API_URL, 'backup.status');
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: BackupStatusResponse };
      assert.ok(data !== undefined, 'Expected data in response');

      // Should now have backup info
      assert.ok(data.lastBackupAt !== null, 'Should have lastBackupAt after recording');
      assert.ok(data.lastBackupHuman !== null, 'Should have human-readable time');
      assert.strictEqual(data.lastBackupStatus, 'success');
      assert.ok(data.lastBackupSizeHuman !== null, 'Should have size');
    });
  });

  await describe('systemInfo includes backup', async () => {
    await test('should include backup info in systemInfo', async () => {
      const response = await trpcQuery(API_URL, 'healthcheck.systemInfo');
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: SystemInfoResponse };
      assert.ok(data !== undefined, 'Expected data in response');

      // Check backup object exists
      assert.ok('backup' in data, 'Should have backup object');
      assert.ok('lastBackupAt' in data.backup, 'Should have lastBackupAt');
      assert.ok('lastBackupHuman' in data.backup, 'Should have lastBackupHuman');
      assert.ok('lastBackupStatus' in data.backup, 'Should have lastBackupStatus');
    });
  });
});
