import * as auth from '../lib/auth.js';
import * as groupsStorage from '../lib/groups-storage.js';
import type { GroupWithCounts } from '../lib/groups-storage.js';
import type { JWTPayload } from '../lib/auth.js';
import type { GroupsResult } from './groups-service-shared.js';

type GroupAccessShape = Pick<GroupWithCounts, 'id' | 'name' | 'ownerUserId'>;
type GroupViewShape = Pick<GroupWithCounts, 'id' | 'name' | 'ownerUserId' | 'visibility'>;

interface GroupsAccessDependencies {
  canApproveGroup: (user: JWTPayload, group: string) => boolean;
  getGroupById: (id: string) => Promise<GroupsResult<GroupWithCounts>>;
  getGroupByName: (name: string) => Promise<GroupsResult<GroupWithCounts>>;
}

const defaultAccessDependencies: GroupsAccessDependencies = {
  canApproveGroup: auth.canApproveGroup,
  getGroupById,
  getGroupByName,
};

export function canUserAccessGroup(user: JWTPayload, group: GroupAccessShape): boolean {
  if (group.ownerUserId && group.ownerUserId === user.sub) {
    return true;
  }

  return auth.canApproveGroup(user, group.id) || auth.canApproveGroup(user, group.name);
}

export function canUserViewGroup(user: JWTPayload, group: GroupViewShape): boolean {
  if (canUserAccessGroup(user, group)) {
    return true;
  }

  return group.visibility === 'instance_public';
}

export async function listGroups(): Promise<GroupWithCounts[]> {
  return groupsStorage.getAllGroups();
}

export async function listGroupsVisibleToUser(user: JWTPayload): Promise<GroupWithCounts[]> {
  const groups = await listGroups();
  return groups.filter((group) => canUserAccessGroup(user, group));
}

export async function listLibraryGroups(): Promise<GroupWithCounts[]> {
  const groups = await listGroups();
  return groups.filter((group) => group.visibility === 'instance_public');
}

export async function getGroupById(id: string): Promise<GroupsResult<GroupWithCounts>> {
  const group = await groupsStorage.getGroupById(id);
  if (!group) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }
  return { ok: true, data: group };
}

export async function getGroupByName(name: string): Promise<GroupsResult<GroupWithCounts>> {
  const group = await groupsStorage.getGroupByName(name);
  if (!group) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }
  return { ok: true, data: group };
}

export async function ensureUserCanAccessGroupId(
  user: JWTPayload,
  groupId: string,
  deps: GroupsAccessDependencies = defaultAccessDependencies
): Promise<GroupsResult<void>> {
  if (deps.canApproveGroup(user, groupId)) {
    return { ok: true, data: undefined };
  }

  const groupResult = await deps.getGroupById(groupId);
  if (!groupResult.ok) {
    return { ok: false, error: groupResult.error };
  }

  if (groupResult.data.ownerUserId && groupResult.data.ownerUserId === user.sub) {
    return { ok: true, data: undefined };
  }

  if (deps.canApproveGroup(user, groupResult.data.name)) {
    return { ok: true, data: undefined };
  }

  return {
    ok: false,
    error: { code: 'FORBIDDEN', message: 'You do not have access to this group' },
  };
}

export async function ensureUserCanViewGroupId(
  user: JWTPayload,
  groupId: string,
  deps: GroupsAccessDependencies = defaultAccessDependencies
): Promise<GroupsResult<void>> {
  if (deps.canApproveGroup(user, groupId)) {
    return { ok: true, data: undefined };
  }

  const groupResult = await deps.getGroupById(groupId);
  if (groupResult.ok) {
    if (canUserViewGroup(user, groupResult.data)) {
      return { ok: true, data: undefined };
    }

    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You do not have access to this group' },
    };
  }

  if (groupResult.error.code !== 'NOT_FOUND') {
    return { ok: false, error: groupResult.error };
  }

  const normalized = groupId.endsWith('.txt') ? groupId.slice(0, -4) : groupId;
  const byName = await deps.getGroupByName(normalized);
  if (!byName.ok) {
    return byName;
  }

  if (canUserViewGroup(user, byName.data)) {
    return { ok: true, data: undefined };
  }

  return {
    ok: false,
    error: { code: 'FORBIDDEN', message: 'You do not have access to this group' },
  };
}

export const GroupsAccessService = {
  canUserAccessGroup,
  canUserViewGroup,
  ensureUserCanAccessGroupId,
  ensureUserCanViewGroupId,
  getGroupById,
  getGroupByName,
  listGroups,
  listGroupsVisibleToUser,
  listLibraryGroups,
};

export default GroupsAccessService;
