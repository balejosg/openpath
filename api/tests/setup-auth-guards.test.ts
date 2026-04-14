import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  parseTRPC,
  registerSetupHttpLifecycle,
  resetDb,
  trpcMutate,
  trpcQuery,
} from './setup-test-harness.js';

registerSetupHttpLifecycle();

await describe('setup admin token management auth guards', { timeout: 30_000 }, async () => {
  beforeEach(async () => {
    await resetDb();
  });

  await test('setup.getRegistrationToken requires admin authentication', async () => {
    const response = await trpcQuery('setup.getRegistrationToken');
    const res = await parseTRPC(response);
    assert.ok(res.error);
  });

  await test('setup.regenerateToken requires admin authentication', async () => {
    const response = await trpcMutate('setup.regenerateToken', {});
    const res = await parseTRPC(response);
    assert.ok(res.error);
  });
});
