import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig, setConfigForTests } from '../src/config.js';
import GoogleAuthService from '../src/services/auth-google.service.js';

void test('auth-google rejects logins when Google OAuth is not configured', async () => {
  setConfigForTests(
    loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      JWT_SECRET: 'google-test-secret',
      GOOGLE_CLIENT_ID: '',
    })
  );

  const result = await GoogleAuthService.loginWithGoogle('invalid-token');
  if (result.ok) {
    assert.fail('Expected Google login to fail when OAuth is not configured');
  }
  assert.equal(result.error.message, 'Google OAuth not configured');
});
