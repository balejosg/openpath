import { after, before, describe, test } from 'node:test';
import assert from 'node:assert';

import type { RolesTestHarness } from './roles-test-harness.js';
import { startRolesTestHarness } from './roles-test-harness.js';
import { parseTRPC } from './test-utils.js';

let harness: RolesTestHarness | undefined;

function getHarness(): RolesTestHarness {
  assert.ok(harness, 'Roles harness should be initialized');
  return harness;
}

void describe('Role management - revoke flows', () => {
  before(async () => {
    harness = await startRolesTestHarness();
  });

  after(async () => {
    await harness?.close();
    harness = undefined;
  });

  void test('revokes an assigned role', async (): Promise<void> => {
    const user = await getHarness().createUser({ name: 'Revoke Test User' });
    const role = await getHarness().assignRole({
      userId: user.id,
      role: 'teacher',
      groupIds: [getHarness().groupIds.ciencias],
    });

    const response = await getHarness().revokeRole({ userId: user.id, roleId: role.id });
    assert.strictEqual(response.status, 200);

    const payload = (await parseTRPC(response)) as { data?: { success?: boolean } };
    assert.strictEqual(payload.data?.success, true);
  });

  void test('handles already revoked roles', async (): Promise<void> => {
    const user = await getHarness().createUser({ name: 'Already Revoked User' });
    const role = await getHarness().assignRole({
      userId: user.id,
      role: 'teacher',
      groupIds: [getHarness().groupIds.ciencias],
    });

    const firstResponse = await getHarness().revokeRole({ userId: user.id, roleId: role.id });
    assert.strictEqual(firstResponse.status, 200);

    const secondResponse = await getHarness().revokeRole({ userId: user.id, roleId: role.id });
    assert.ok([200, 400, 404].includes(secondResponse.status));
  });
});
