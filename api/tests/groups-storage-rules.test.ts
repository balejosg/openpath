import assert from 'node:assert/strict';
import test from 'node:test';

const GroupsStorageRules = await import('../src/lib/groups-storage-rules.js');

await test('groups-storage rules module exposes rule entrypoints', () => {
  assert.equal(typeof GroupsStorageRules.copyRulesToGroup, 'function');
  assert.equal(typeof GroupsStorageRules.getRulesByGroup, 'function');
  assert.equal(typeof GroupsStorageRules.getRulesByGroupPaginated, 'function');
  assert.equal(typeof GroupsStorageRules.getRulesByGroupGrouped, 'function');
  assert.equal(typeof GroupsStorageRules.createRule, 'function');
  assert.equal(typeof GroupsStorageRules.updateRule, 'function');
  assert.equal(typeof GroupsStorageRules.deleteRule, 'function');
  assert.equal(typeof GroupsStorageRules.bulkCreateRules, 'function');
  assert.equal(typeof GroupsStorageRules.bulkDeleteRules, 'function');
  assert.equal(typeof GroupsStorageRules.isDomainBlocked, 'function');
});
