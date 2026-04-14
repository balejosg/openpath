import { after, before, describe, test } from 'node:test';
import assert from 'node:assert';

import type { RolesTestHarness } from './roles-test-harness.js';
import { startRolesTestHarness } from './roles-test-harness.js';

let harness: RolesTestHarness | undefined;

function getHarness(): RolesTestHarness {
  assert.ok(harness, 'Roles harness should be initialized');
  return harness;
}

void describe('Role management - authorization guards', () => {
  before(async () => {
    harness = await startRolesTestHarness();
  });

  after(async () => {
    await harness?.close();
    harness = undefined;
  });

  void test('rejects role assignment without admin token', async (): Promise<void> => {
    const user = await getHarness().createUser();
    const response = await getHarness().trpcMutate('users.assignRole', {
      userId: user.id,
      role: 'teacher',
      groupIds: [getHarness().groupIds.ciencias],
    });

    assert.strictEqual(response.status, 401);
  });

  void test('rejects user listing without admin token', async (): Promise<void> => {
    const response = await getHarness().trpcQuery('users.list');
    assert.strictEqual(response.status, 401);
  });
});
