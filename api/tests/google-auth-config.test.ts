import { describe, test } from 'node:test';

import assert from 'node:assert/strict';

import { getApiUrl, registerGoogleAuthLifecycle } from './google-auth-test-harness.js';

registerGoogleAuthLifecycle();

void describe('Google auth API - config surface', { timeout: 30_000 }, () => {
  void test('GET /api/config returns the googleClientId field', async () => {
    const response = await fetch(`${getApiUrl()}/api/config`);
    assert.equal(response.status, 200);

    const config = (await response.json()) as { googleClientId?: string };
    assert.equal('googleClientId' in config, true);
  });
});
