import { describe, test } from 'node:test';

import assert from 'node:assert/strict';

import { registerBackupLifecycle, trpcMutate } from './backup-test-harness.js';

registerBackupLifecycle();

void describe('Backup router - shared secret guards', { timeout: 30_000 }, () => {
  void test('backup.record rejects requests without shared secret', async () => {
    const response = await trpcMutate('backup.record', { status: 'success' });
    assert.equal(response.status, 401);
  });

  void test('backup.record rejects requests with the wrong shared secret', async () => {
    const response = await trpcMutate(
      'backup.record',
      { status: 'success' },
      { Authorization: 'Bearer wrong-secret' }
    );
    assert.equal(response.status, 401);
  });
});
