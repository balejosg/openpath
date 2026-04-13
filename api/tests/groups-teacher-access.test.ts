import { after, before, describe, test } from 'node:test';
import assert from 'node:assert';

import {
  type GroupWithCounts,
  type Rule,
  startGroupsTestHarness,
  uniqueGroupName,
} from './groups-test-harness.js';
import { assertStatus, bearerAuth, parseTRPC, TEST_RUN_ID } from './test-utils.js';

let harness: Awaited<ReturnType<typeof startGroupsTestHarness>> | undefined;

function getHarness(): Awaited<ReturnType<typeof startGroupsTestHarness>> {
  if (harness === undefined) {
    throw new Error('Expected groups test harness to be initialized');
  }
  return harness;
}

await describe('Groups Router - teacher access control', { timeout: 30000 }, async () => {
  before(async () => {
    harness = await startGroupsTestHarness();
  });

  after(async () => {
    if (harness !== undefined) {
      await harness.close();
    }
  });

  await describe('Teacher Access Control', async () => {
    let teacherToken = '';
    let teacherGroupId = '';
    let otherGroupId = '';
    let otherRuleId = '';

    before(async () => {
      const activeHarness = getHarness();
      teacherGroupId = (
        await activeHarness.createGroup({
          displayName: 'Teacher Allowed Group',
          name: uniqueGroupName('teacher-allowed'),
        })
      ).id;
      otherGroupId = (
        await activeHarness.createGroup({
          displayName: 'Teacher Denied Group',
          name: uniqueGroupName('teacher-denied'),
        })
      ).id;

      const deniedRuleResp = await activeHarness.trpcMutate(
        'groups.createRule',
        {
          groupId: otherGroupId,
          type: 'whitelist',
          value: `denied-${TEST_RUN_ID}-${Math.random().toString(36).slice(2, 6)}.com`,
        },
        bearerAuth(activeHarness.adminToken)
      );
      assertStatus(deniedRuleResp, 200);
      const { data: deniedRule } = (await parseTRPC(deniedRuleResp)) as { data?: { id: string } };
      otherRuleId = deniedRule?.id ?? '';
      assert.ok(otherRuleId);

      teacherToken = (await activeHarness.createTeacherSession([teacherGroupId])).accessToken;
    });

    await test('should allow teacher to list only assigned groups', async () => {
      const response = await getHarness().trpcQuery(
        'groups.list',
        undefined,
        bearerAuth(teacherToken)
      );
      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: GroupWithCounts[] };
      assert.ok(Array.isArray(data));
      assert.ok(data.some((group) => group.id === teacherGroupId));
      assert.ok(!data.some((group) => group.id === otherGroupId));
    });

    await test('should allow teacher to manage rules only in assigned group', async () => {
      const value = `teacher-${TEST_RUN_ID}-${Math.random().toString(36).slice(2, 6)}.com`;

      const createResp = await getHarness().trpcMutate(
        'groups.createRule',
        {
          groupId: teacherGroupId,
          type: 'whitelist',
          value,
        },
        bearerAuth(teacherToken)
      );
      assertStatus(createResp, 200);

      const listResp = await getHarness().trpcQuery(
        'groups.listRules',
        { groupId: teacherGroupId },
        bearerAuth(teacherToken)
      );
      assertStatus(listResp, 200);

      const { data } = (await parseTRPC(listResp)) as { data?: Rule[] };
      assert.ok(Array.isArray(data));
      assert.ok(data.some((rule) => rule.value === value));

      const forbiddenList = await getHarness().trpcQuery(
        'groups.listRules',
        { groupId: otherGroupId },
        bearerAuth(teacherToken)
      );
      assert.strictEqual(forbiddenList.status, 403);
    });

    await test('should return NOT_FOUND for non-existent group-scoped operations', async () => {
      const response = await getHarness().trpcQuery(
        'groups.listRules',
        { groupId: '00000000-0000-0000-0000-000000000000' },
        bearerAuth(teacherToken)
      );
      assert.strictEqual(response.status, 404);
    });

    await test('should forbid teacher from deleting rules outside their groups', async () => {
      const response = await getHarness().trpcMutate(
        'groups.deleteRule',
        { id: otherRuleId },
        bearerAuth(teacherToken)
      );
      assert.strictEqual(response.status, 403);

      const spoofedGroupIdResp = await getHarness().trpcMutate(
        'groups.deleteRule',
        { id: otherRuleId, groupId: teacherGroupId },
        bearerAuth(teacherToken)
      );
      assert.strictEqual(spoofedGroupIdResp.status, 403);

      const bulkResp = await getHarness().trpcMutate(
        'groups.bulkDeleteRules',
        { ids: [otherRuleId] },
        bearerAuth(teacherToken)
      );
      assert.strictEqual(bulkResp.status, 403);
    });

    await test('should forbid teacher from system-level group operations', async () => {
      const statsResp = await getHarness().trpcQuery(
        'groups.stats',
        undefined,
        bearerAuth(teacherToken)
      );
      assert.strictEqual(statsResp.status, 403);

      const systemStatusResp = await getHarness().trpcQuery(
        'groups.systemStatus',
        undefined,
        bearerAuth(teacherToken)
      );
      assert.strictEqual(systemStatusResp.status, 403);

      const toggleResp = await getHarness().trpcMutate(
        'groups.toggleSystem',
        { enable: false },
        bearerAuth(teacherToken)
      );
      assert.strictEqual(toggleResp.status, 403);

      const exportAllResp = await getHarness().trpcQuery(
        'groups.exportAll',
        undefined,
        bearerAuth(teacherToken)
      );
      assert.strictEqual(exportAllResp.status, 403);
    });
  });
});
