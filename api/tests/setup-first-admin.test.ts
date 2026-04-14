import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  parseTRPC,
  registerSetupHttpLifecycle,
  resetDb,
  trpcMutate,
  trpcQuery,
  uniqueSetupEmail,
} from './setup-test-harness.js';

interface SetupStatusData {
  needsSetup: boolean;
  hasAdmin: boolean;
}

interface FirstAdminData {
  success: boolean;
  registrationToken: string;
  user: { id: string; email: string; name: string };
}

registerSetupHttpLifecycle();

function buildAdminInput(): {
  email: string;
  name: string;
  password: string;
} {
  return {
    email: uniqueSetupEmail('setup-admin'),
    name: 'First Admin',
    password: 'SecurePassword123!',
  };
}

await describe('setup.createFirstAdmin', { timeout: 30_000 }, async () => {
  beforeEach(async () => {
    await resetDb();
  });

  await test('creates the first admin and returns a registration token', async () => {
    const adminData = buildAdminInput();

    const response = await trpcMutate('setup.createFirstAdmin', adminData);
    assert.equal(response.status, 200);

    const res = await parseTRPC(response);
    const data = res.data as FirstAdminData;
    assert.equal(data.success, true);
    assert.equal(data.registrationToken.length, 64);
    assert.equal(data.user.email, adminData.email.toLowerCase());
  });

  await test('marks setup as completed after creating an admin', async () => {
    await trpcMutate('setup.createFirstAdmin', buildAdminInput());

    const response = await trpcQuery('setup.status');
    const res = await parseTRPC(response);
    const data = res.data as SetupStatusData;

    assert.equal(data.needsSetup, false);
    assert.equal(data.hasAdmin, true);
  });

  await test('rejects creating a second admin after setup completes', async () => {
    await trpcMutate('setup.createFirstAdmin', buildAdminInput());

    const response = await trpcMutate('setup.createFirstAdmin', {
      email: uniqueSetupEmail('setup-admin-second'),
      name: 'Second Admin',
      password: 'AnotherPassword123!',
    });

    const res = await parseTRPC(response);
    assert.ok(res.error);
    assert.match(res.error, /Setup already completed/);
  });

  await test('validates required fields and password length', async () => {
    const missingEmail = await trpcMutate('setup.createFirstAdmin', {
      name: 'Test',
      password: 'SecurePassword123!',
    });
    assert.ok((await parseTRPC(missingEmail)).error);

    const missingPassword = await trpcMutate('setup.createFirstAdmin', {
      email: uniqueSetupEmail('setup-missing-password'),
      name: 'Test',
    });
    assert.ok((await parseTRPC(missingPassword)).error);

    const shortPassword = await trpcMutate('setup.createFirstAdmin', {
      email: uniqueSetupEmail('setup-short-password'),
      name: 'Test',
      password: '123',
    });
    assert.ok((await parseTRPC(shortPassword)).error);
  });
});
