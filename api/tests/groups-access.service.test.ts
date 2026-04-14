import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  canUserAccessGroup,
  canUserViewGroup,
  ensureUserCanAccessGroupId,
  ensureUserCanViewGroupId,
} from '../src/services/groups-access.service.js';
import type { JWTPayload } from '../src/lib/auth.js';
import type { GroupsResult } from '../src/services/groups-service-shared.js';

function createUser(overrides: Partial<JWTPayload> = {}): JWTPayload {
  return {
    sub: 'teacher-1',
    email: 'teacher@example.com',
    name: 'Teacher One',
    roles: [],
    type: 'access',
    ...overrides,
  };
}

function okGroup(overrides: Record<string, unknown> = {}): GroupsResult<{
  id: string;
  name: string;
  displayName: string;
  enabled: boolean;
  visibility: 'private' | 'instance_public';
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string | null;
  whitelistCount: number;
  blockedSubdomainCount: number;
  blockedPathCount: number;
}> {
  return {
    ok: true,
    data: {
      id: 'group-1',
      name: 'library-group',
      displayName: 'Library Group',
      enabled: true,
      visibility: 'private',
      ownerUserId: null,
      createdAt: '',
      updatedAt: null,
      whitelistCount: 0,
      blockedSubdomainCount: 0,
      blockedPathCount: 0,
      ...overrides,
    },
  };
}

await describe('groups access service', async () => {
  await test('allows owners and approvers to access a group', () => {
    const ownerUser = createUser();
    const approverUser = createUser({ sub: 'teacher-2' });

    assert.equal(
      canUserAccessGroup(ownerUser, {
        id: 'group-1',
        name: 'library-group',
        ownerUserId: 'teacher-1',
      }),
      true
    );

    assert.equal(
      canUserAccessGroup(approverUser, {
        id: 'group-1',
        name: 'library-group',
        ownerUserId: null,
      }),
      false
    );
  });

  await test('allows instance-public groups to be viewed without edit access', () => {
    assert.equal(
      canUserViewGroup(createUser(), {
        id: 'group-1',
        name: 'library-group',
        ownerUserId: null,
        visibility: 'instance_public',
      }),
      true
    );
  });

  await test('checks direct access by id, owner and name fallback', async () => {
    const user = createUser();
    const denied = await ensureUserCanAccessGroupId(user, 'group-1', {
      canApproveGroup: () => false,
      getGroupById: () => Promise.resolve(okGroup({ ownerUserId: null })),
      getGroupByName: () => Promise.resolve(okGroup()),
    });
    assert.deepEqual(denied, {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You do not have access to this group' },
    });

    const owner = await ensureUserCanAccessGroupId(user, 'group-1', {
      canApproveGroup: () => false,
      getGroupById: () => Promise.resolve(okGroup({ ownerUserId: 'teacher-1' })),
      getGroupByName: () => Promise.resolve(okGroup()),
    });
    assert.deepEqual(owner, { ok: true, data: undefined });

    const approverByName = await ensureUserCanAccessGroupId(user, 'group-1', {
      canApproveGroup: (_candidateUser, group) => group === 'library-group',
      getGroupById: () => Promise.resolve(okGroup({ ownerUserId: null })),
      getGroupByName: () => Promise.resolve(okGroup()),
    });
    assert.deepEqual(approverByName, { ok: true, data: undefined });
  });

  await test('checks view access with .txt fallback and public visibility', async () => {
    const user = createUser();

    const visibleByName = await ensureUserCanViewGroupId(user, 'library-group.txt', {
      canApproveGroup: () => false,
      getGroupById: () =>
        Promise.resolve({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'missing' },
        }),
      getGroupByName: () => Promise.resolve(okGroup({ visibility: 'instance_public' })),
    });
    assert.deepEqual(visibleByName, { ok: true, data: undefined });

    const missing = await ensureUserCanViewGroupId(user, 'missing.txt', {
      canApproveGroup: () => false,
      getGroupById: () =>
        Promise.resolve({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'missing' },
        }),
      getGroupByName: () =>
        Promise.resolve({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'missing' },
        }),
    });
    assert.deepEqual(missing, {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'missing' },
    });
  });
});
