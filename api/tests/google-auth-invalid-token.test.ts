import { describe, test } from 'node:test';

import assert from 'node:assert/strict';

import { parseTRPC, registerGoogleAuthLifecycle, trpcMutate } from './google-auth-test-harness.js';

registerGoogleAuthLifecycle({
  googleClientId: '12345-test.apps.googleusercontent.com',
});

void describe('Google auth API - invalid token handling', { timeout: 30_000 }, () => {
  void test('auth.googleLogin rejects invalid Google ID tokens', async () => {
    const response = await trpcMutate('auth.googleLogin', { idToken: 'invalid-garbage-token' });

    assert.notEqual(response.status, 200);

    const { error } = await parseTRPC(response);
    assert.ok(error);
  });
});
