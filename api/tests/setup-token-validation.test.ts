import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  parseTRPC,
  registerSetupHttpLifecycle,
  resetDb,
  trpcMutate,
  uniqueSetupEmail,
} from './setup-test-harness.js';

interface FirstAdminData {
  registrationToken: string;
}

interface ValidateTokenData {
  valid: boolean;
}

registerSetupHttpLifecycle();

async function createValidToken(): Promise<string> {
  const response = await trpcMutate('setup.createFirstAdmin', {
    email: uniqueSetupEmail('setup-token-admin'),
    name: 'Token Test Admin',
    password: 'SecurePassword123!',
  });
  const res = await parseTRPC(response);
  const data = res.data as FirstAdminData;
  return data.registrationToken;
}

await describe('setup.validateToken', { timeout: 30_000 }, async () => {
  beforeEach(async () => {
    await resetDb();
  });

  await test('accepts the registration token returned during setup', async () => {
    const validToken = await createValidToken();

    const response = await trpcMutate('setup.validateToken', {
      token: validToken,
    });

    assert.equal(response.status, 200);
    const res = await parseTRPC(response);
    const data = res.data as ValidateTokenData;
    assert.equal(data.valid, true);
  });

  await test('rejects invalid registration tokens', async () => {
    await createValidToken();

    const response = await trpcMutate('setup.validateToken', {
      token: 'invalid-token-that-is-wrong',
    });

    assert.equal(response.status, 200);
    const res = await parseTRPC(response);
    const data = res.data as ValidateTokenData;
    assert.equal(data.valid, false);
  });

  await test('requires a token in the request body', async () => {
    const response = await trpcMutate('setup.validateToken', {});
    const res = await parseTRPC(response);
    assert.ok(res.error);
  });
});
