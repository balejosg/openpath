import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import * as groupsStorage from '../src/lib/groups-storage.js';
import { ensureTestSchema, resetDb } from './test-utils.js';

before(async () => {
  process.env.NODE_ENV = 'test';
  await ensureTestSchema();
});

beforeEach(async () => {
  await resetDb();
});

await describe('groups disabled export', async () => {
  await it('returns only the fail-open marker when a group is disabled', async () => {
    const groupId = await groupsStorage.createGroup(
      'disabled-export-group',
      'Disabled Export Group'
    );

    await groupsStorage.bulkCreateRules(groupId, 'whitelist', ['legacy.example.com']);
    await groupsStorage.bulkCreateRules(groupId, 'blocked_subdomain', ['cdn.legacy.example.com']);
    await groupsStorage.bulkCreateRules(groupId, 'blocked_path', ['legacy.example.com/path']);
    await groupsStorage.updateGroup(groupId, 'Disabled Export Group', false, 'private');

    assert.strictEqual(await groupsStorage.exportGroup(groupId), '#DESACTIVADO\n');
  });
});
