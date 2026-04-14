import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  createGroup,
  exportGroup,
  toggleSystemStatus,
} from '../src/services/groups-management.service.js';

await describe('groups management service', async () => {
  await test('sanitizes group names before creating them', async () => {
    let createdName = '';

    const result = await createGroup(
      {
        name: '  Aula Principal !!! ',
        displayName: 'Aula Principal',
      },
      {
        createGroup: (name) => {
          createdName = name;
          return Promise.resolve('group-1');
        },
      }
    );

    assert.deepEqual(result, {
      ok: true,
      data: {
        id: 'group-1',
        name: 'aula-principal',
      },
    });
    assert.equal(createdName, 'aula-principal');
  });

  await test('maps duplicate group names to conflict results', async () => {
    const result = await createGroup(
      {
        name: 'library',
        displayName: 'Library',
      },
      {
        createGroup: () => {
          throw new Error('UNIQUE_CONSTRAINT_VIOLATION');
        },
      }
    );

    assert.deepEqual(result, {
      ok: false,
      error: { code: 'CONFLICT', message: 'A group with this name already exists' },
    });
  });

  await test('returns not found when exporting an unknown group', async () => {
    const result = await exportGroup('missing-group', {
      exportGroup: () => Promise.resolve(null),
      getGroupById: () => Promise.resolve(null),
    });

    assert.deepEqual(result, {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Group not found' },
    });
  });

  await test('publishes a global whitelist refresh when toggling system status', async () => {
    let published = false;

    const result = await toggleSystemStatus(false, {
      publishAllWhitelistsChanged: () => {
        published = true;
      },
      toggleSystemStatus: () =>
        Promise.resolve({
          enabled: false,
          totalGroups: 10,
          activeGroups: 0,
          pausedGroups: 10,
        }),
    });

    assert.deepEqual(result, {
      enabled: false,
      totalGroups: 10,
      activeGroups: 0,
      pausedGroups: 10,
    });
    assert.equal(published, true);
  });
});
