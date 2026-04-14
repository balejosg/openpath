import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  getBearerAuth,
  registerApiTokensLifecycle,
  trpcMutate,
  trpcQuery,
} from './api-tokens-test-harness.js';

registerApiTokensLifecycle();

await describe('API token surface removal - authenticated procedures', async () => {
  await test('removes apiTokens.list for authenticated users', async () => {
    const response = await trpcQuery('apiTokens.list', undefined, getBearerAuth());
    assert.equal(response.status, 404);
  });

  await test('removes apiTokens.create for authenticated users', async () => {
    const response = await trpcMutate(
      'apiTokens.create',
      { name: 'legacy token' },
      getBearerAuth()
    );
    assert.equal(response.status, 404);
  });

  await test('removes apiTokens.revoke for authenticated users', async () => {
    const response = await trpcMutate('apiTokens.revoke', { id: 'tok_legacy' }, getBearerAuth());
    assert.equal(response.status, 404);
  });

  await test('removes apiTokens.regenerate for authenticated users', async () => {
    const response = await trpcMutate(
      'apiTokens.regenerate',
      { id: 'tok_legacy' },
      getBearerAuth()
    );
    assert.equal(response.status, 404);
  });
});
