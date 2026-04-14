import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { parseTRPC, registerSetupHttpLifecycle, resetDb, trpcQuery } from './setup-test-harness.js';

interface SetupStatusData {
  needsSetup: boolean;
  hasAdmin: boolean;
}

registerSetupHttpLifecycle();

await describe('setup.status', { timeout: 30_000 }, async () => {
  beforeEach(async () => {
    await resetDb();
  });

  await test('returns needsSetup=true when no admins exist', async () => {
    const response = await trpcQuery('setup.status');
    assert.equal(response.status, 200);

    const res = await parseTRPC(response);
    const data = res.data as SetupStatusData;
    assert.equal(data.needsSetup, true);
    assert.equal(data.hasAdmin, false);
  });
});
