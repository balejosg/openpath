import { describe, test } from 'node:test';

import assert from 'node:assert/strict';

import { createGoogleAuthHarness } from './google-auth-test-harness.js';

const googleAuth = createGoogleAuthHarness();
googleAuth.registerLifecycle();

void describe('Google auth API - missing client id', { timeout: 30_000 }, () => {
  void test('auth.googleLogin fails when GOOGLE_CLIENT_ID is not configured', async () => {
    const response = await googleAuth.trpcMutate('auth.googleLogin', { idToken: 'fake-token' });
    assert.notEqual(response.status, 200);

    const { error } = await googleAuth.parseTRPC(response);
    assert.match(error ?? '', /Google|config/i);
  });
});
