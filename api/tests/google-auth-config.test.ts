import { describe, test } from 'node:test';

import assert from 'node:assert/strict';

import { createGoogleAuthHarness } from './google-auth-test-harness.js';

const googleAuth = createGoogleAuthHarness();
googleAuth.registerLifecycle();

void describe('Google auth API - config surface', { timeout: 30_000 }, () => {
  void test('GET /api/config returns the googleClientId field', async () => {
    const response = await fetch(`${googleAuth.getApiUrl()}/api/config`);
    assert.equal(response.status, 200);

    const config = (await response.json()) as { googleClientId?: string };
    assert.equal('googleClientId' in config, true);
  });
});
