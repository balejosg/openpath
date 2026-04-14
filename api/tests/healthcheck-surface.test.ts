import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { registerHealthcheckLifecycle, trpcQuery } from './healthcheck-test-harness.js';

registerHealthcheckLifecycle();

await describe('healthcheck.systemInfo', async () => {
  await test('is removed from the public surface', async () => {
    const response = await trpcQuery('healthcheck.systemInfo');
    assert.equal(response.status, 404);
  });
});
