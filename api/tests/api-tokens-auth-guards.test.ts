import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { registerApiTokensLifecycle, trpcQuery } from './api-tokens-test-harness.js';

registerApiTokensLifecycle();

await describe('API token surface removal - unauthenticated guards', async () => {
  await test('keeps unauthenticated callers out of removed procedures', async () => {
    const response = await trpcQuery('apiTokens.list');
    assert.equal(response.status, 401);
  });
});
