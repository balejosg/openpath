import { describe, test } from 'node:test';

import assert from 'node:assert/strict';

import { registerBackupLifecycle, trpcQuery } from './backup-test-harness.js';

registerBackupLifecycle();

void describe('Backup router - removed operational surfaces', { timeout: 30_000 }, () => {
  void test('backup.status is removed from the product surface', async () => {
    const response = await trpcQuery('backup.status');
    assert.equal(response.status, 404);
  });

  void test('healthcheck.systemInfo is removed from the product surface', async () => {
    const response = await trpcQuery('healthcheck.systemInfo');
    assert.equal(response.status, 404);
  });
});
