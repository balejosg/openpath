import { describe, test } from 'node:test';

import assert from 'node:assert/strict';

import { createGoogleAuthHarness } from './google-auth-test-harness.js';

const googleAuth = createGoogleAuthHarness({
  googleClientId: '12345-test.apps.googleusercontent.com',
});
googleAuth.registerLifecycle();

void describe('Google auth API - invalid token handling', { timeout: 30_000 }, () => {
  void test('auth.googleLogin rejects invalid Google ID tokens', async () => {
    const response = await googleAuth.trpcMutate('auth.googleLogin', {
      idToken: 'invalid-garbage-token',
    });

    assert.notEqual(response.status, 200);

    const { error } = await googleAuth.parseTRPC(response);
    assert.ok(error);
  });
});
