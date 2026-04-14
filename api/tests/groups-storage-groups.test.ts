import assert from 'node:assert/strict';
import test from 'node:test';

const GroupsStorageGroups = await import('../src/lib/groups-storage-groups.js');

await test('groups-storage groups module exposes CRUD entrypoints', () => {
  assert.equal(typeof GroupsStorageGroups.getAllGroups, 'function');
  assert.equal(typeof GroupsStorageGroups.getGroupById, 'function');
  assert.equal(typeof GroupsStorageGroups.getGroupByName, 'function');
  assert.equal(typeof GroupsStorageGroups.createGroup, 'function');
  assert.equal(typeof GroupsStorageGroups.updateGroup, 'function');
  assert.equal(typeof GroupsStorageGroups.deleteGroup, 'function');
  assert.equal(typeof GroupsStorageGroups.getStats, 'function');
  assert.equal(typeof GroupsStorageGroups.getSystemStatus, 'function');
  assert.equal(typeof GroupsStorageGroups.toggleSystemStatus, 'function');
});
