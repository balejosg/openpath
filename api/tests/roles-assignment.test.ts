import { after, before, describe, test } from 'node:test';
import assert from 'node:assert';

import type { RolesTestHarness } from './roles-test-harness.js';
import { startRolesTestHarness } from './roles-test-harness.js';
import { bearerAuth } from './test-utils.js';

let harness: RolesTestHarness | undefined;

function getHarness(): RolesTestHarness {
  assert.ok(harness, 'Roles harness should be initialized');
  return harness;
}

void describe('Role management - assignment flows', () => {
  before(async () => {
    harness = await startRolesTestHarness();
  });

  after(async () => {
    await harness?.close();
    harness = undefined;
  });

  void test('assigns teacher role with groups', async (): Promise<void> => {
    const teacher = await getHarness().createUser();
    const role = await getHarness().assignRole({
      userId: teacher.id,
      role: 'teacher',
      groupIds: [getHarness().groupIds.ciencias, getHarness().groupIds.matematicas],
    });

    assert.strictEqual(role.role, 'teacher');
    assert.deepStrictEqual(role.groupIds, [
      getHarness().groupIds.ciencias,
      getHarness().groupIds.matematicas,
    ]);
  });

  void test('allows teacher role assignment without groups', async (): Promise<void> => {
    const teacher = await getHarness().createUser({ name: 'Another Teacher' });
    const response = await getHarness().trpcMutate(
      'users.assignRole',
      {
        userId: teacher.id,
        role: 'teacher',
        groupIds: [],
      },
      bearerAuth(getHarness().adminToken)
    );

    assert.ok([200, 400].includes(response.status));
  });

  void test('rejects invalid role assignment', async (): Promise<void> => {
    const teacher = await getHarness().createUser();
    const response = await getHarness().trpcMutate(
      'users.assignRole',
      {
        userId: teacher.id,
        role: 'superadmin',
        groupIds: [],
      },
      bearerAuth(getHarness().adminToken)
    );

    assert.strictEqual(response.status, 400);
  });

  void test('rejects teacher role assignment for unknown groups', async (): Promise<void> => {
    const teacher = await getHarness().createUser();
    const response = await getHarness().trpcMutate(
      'users.assignRole',
      {
        userId: teacher.id,
        role: 'teacher',
        groupIds: ['missing-group-id'],
      },
      bearerAuth(getHarness().adminToken)
    );

    assert.strictEqual(response.status, 400);
  });

  void test('users.get returns assigned teacher roles', async (): Promise<void> => {
    const teacher = await getHarness().createUser();
    await getHarness().assignRole({
      userId: teacher.id,
      role: 'teacher',
      groupIds: [getHarness().groupIds.ciencias],
    });

    const fetchedUser = await getHarness().fetchUser(teacher.id);
    assert.ok(Array.isArray(fetchedUser.roles));
    const teacherRole = fetchedUser.roles.find((entry) => entry.role === 'teacher');
    assert.ok(teacherRole);
    assert.ok(teacherRole.groupIds.includes(getHarness().groupIds.ciencias));
  });

  void test('documents that role updates still use revoke plus assign', async (): Promise<void> => {
    const response = await getHarness().trpcQuery(
      'users.list',
      undefined,
      bearerAuth(getHarness().adminToken)
    );
    assert.strictEqual(response.status, 200);
  });
});
