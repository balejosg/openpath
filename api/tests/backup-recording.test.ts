import { describe, test } from 'node:test';

import assert from 'node:assert/strict';

import { parseTRPC, registerBackupLifecycle, trpcMutate } from './backup-test-harness.js';

interface BackupRecordResponse {
  error?: string;
  recordedAt?: string;
  success: boolean;
}

registerBackupLifecycle();

void describe('Backup router - recording and validation', { timeout: 30_000 }, () => {
  void test('backup.record stores successful backups with a timestamp', async () => {
    const response = await trpcMutate(
      'backup.record',
      { status: 'success', sizeBytes: 1_024_000 },
      { Authorization: 'Bearer test-backup-secret' }
    );
    assert.equal(response.status, 200);

    const { data } = (await parseTRPC(response)) as { data?: BackupRecordResponse };
    assert.ok(data, 'Expected data in response');
    assert.equal(data.success, true);
    assert.ok(data.recordedAt, 'Expected recordedAt timestamp');
  });

  void test('backup.record stores failed backups', async () => {
    const response = await trpcMutate(
      'backup.record',
      { status: 'failed' },
      { Authorization: 'Bearer test-backup-secret' }
    );
    assert.equal(response.status, 200);

    const { data } = (await parseTRPC(response)) as { data?: BackupRecordResponse };
    assert.ok(data, 'Expected data in response');
    assert.equal(data.success, true);
  });

  void test('backup.record validates the status enum', async () => {
    const response = await trpcMutate(
      'backup.record',
      { status: 'invalid' },
      { Authorization: 'Bearer test-backup-secret' }
    );
    assert.equal(response.status, 400);
  });
});
