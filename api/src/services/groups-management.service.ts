import * as groupsStorage from '../lib/groups-storage.js';
import { withTransaction } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import type { GroupWithCounts, GroupStats, SystemStatus } from '../lib/groups-storage.js';
import { sanitizeSlug } from '@openpath/shared';
import DomainEventsService from './domain-events.service.js';
import type {
  CloneGroupInput,
  CreateGroupInput,
  ExportResult,
  GroupsResult,
  UpdateGroupInput,
} from './groups-service-shared.js';

interface GroupsManagementDependencies {
  createGroup: typeof groupsStorage.createGroup;
  copyRulesToGroup: typeof groupsStorage.copyRulesToGroup;
  deleteGroup: typeof groupsStorage.deleteGroup;
  exportAllGroups: typeof groupsStorage.exportAllGroups;
  exportGroup: typeof groupsStorage.exportGroup;
  getGroupById: typeof groupsStorage.getGroupById;
  getGroupMetaByName: typeof groupsStorage.getGroupMetaByName;
  getStats: typeof groupsStorage.getStats;
  getSystemStatus: typeof groupsStorage.getSystemStatus;
  publishAllWhitelistsChanged: () => void;
  publishWhitelistChanged: (groupId: string) => void;
  toggleSystemStatus: typeof groupsStorage.toggleSystemStatus;
  touchGroupUpdatedAt: typeof groupsStorage.touchGroupUpdatedAt;
  updateGroup: typeof groupsStorage.updateGroup;
  withTransaction: typeof withTransaction;
}

const defaultManagementDependencies: GroupsManagementDependencies = {
  createGroup: groupsStorage.createGroup,
  copyRulesToGroup: groupsStorage.copyRulesToGroup,
  deleteGroup: groupsStorage.deleteGroup,
  exportAllGroups: groupsStorage.exportAllGroups,
  exportGroup: groupsStorage.exportGroup,
  getGroupById: groupsStorage.getGroupById,
  getGroupMetaByName: groupsStorage.getGroupMetaByName,
  getStats: groupsStorage.getStats,
  getSystemStatus: groupsStorage.getSystemStatus,
  publishAllWhitelistsChanged:
    DomainEventsService.publishAllWhitelistsChanged.bind(DomainEventsService),
  publishWhitelistChanged: DomainEventsService.publishWhitelistChanged.bind(DomainEventsService),
  toggleSystemStatus: groupsStorage.toggleSystemStatus,
  touchGroupUpdatedAt: groupsStorage.touchGroupUpdatedAt,
  updateGroup: groupsStorage.updateGroup,
  withTransaction,
};

function sanitizeGroupName(raw: string): string {
  return sanitizeSlug(raw, { maxLength: 100, allowUnderscore: true });
}

async function findAvailableGroupName(
  baseName: string,
  deps: Pick<GroupsManagementDependencies, 'getGroupMetaByName'> = defaultManagementDependencies
): Promise<string> {
  const trimmedBase = sanitizeGroupName(baseName);
  if (!trimmedBase) {
    return `group-${uuidv4().slice(0, 8)}`;
  }

  const maxAttempts = 50;
  for (let i = 0; i < maxAttempts; i += 1) {
    const suffix = i === 0 ? '' : `-${String(i + 1)}`;
    const candidate = `${trimmedBase}${suffix}`.slice(0, 100).replace(/-+$/g, '');
    const exists = await deps.getGroupMetaByName(candidate);
    if (!exists) {
      return candidate;
    }
  }

  return `${trimmedBase}-${uuidv4().slice(0, 8)}`.slice(0, 100).replace(/-+$/g, '');
}

export async function createGroup(
  input: CreateGroupInput,
  deps: Pick<GroupsManagementDependencies, 'createGroup'> = defaultManagementDependencies
): Promise<GroupsResult<{ id: string; name: string }>> {
  if (!input.name || input.name.trim() === '') {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'Name is required' } };
  }
  if (!input.displayName || input.displayName.trim() === '') {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'Display name is required' } };
  }

  const safeName = sanitizeGroupName(input.name);
  if (!safeName) {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'Name is invalid' } };
  }

  try {
    const id = await deps.createGroup(safeName, input.displayName, {
      ...(input.visibility ? { visibility: input.visibility } : {}),
      ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
    });
    return { ok: true, data: { id, name: safeName } };
  } catch (error) {
    if (error instanceof Error && error.message === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return {
        ok: false,
        error: { code: 'CONFLICT', message: 'A group with this name already exists' },
      };
    }

    throw error;
  }
}

export async function updateGroup(
  input: UpdateGroupInput,
  deps: Pick<
    GroupsManagementDependencies,
    'getGroupById' | 'publishWhitelistChanged' | 'updateGroup'
  > = defaultManagementDependencies
): Promise<GroupsResult<GroupWithCounts>> {
  const existing = await deps.getGroupById(input.id);
  if (!existing) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }

  await deps.updateGroup(input.id, input.displayName, input.enabled, input.visibility);

  const updated = await deps.getGroupById(input.id);
  if (!updated) {
    return {
      ok: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch updated group' },
    };
  }

  if (existing.enabled !== input.enabled) {
    deps.publishWhitelistChanged(input.id);
  }

  return { ok: true, data: updated };
}

export async function deleteGroup(
  id: string,
  deps: Pick<
    GroupsManagementDependencies,
    'deleteGroup' | 'getGroupById' | 'publishWhitelistChanged'
  > = defaultManagementDependencies
): Promise<GroupsResult<{ deleted: boolean }>> {
  const existing = await deps.getGroupById(id);
  if (!existing) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }

  const deleted = await deps.deleteGroup(id);
  if (deleted) {
    deps.publishWhitelistChanged(id);
  }

  return { ok: true, data: { deleted } };
}

export async function cloneGroup(
  input: CloneGroupInput,
  deps: Pick<
    GroupsManagementDependencies,
    | 'copyRulesToGroup'
    | 'createGroup'
    | 'getGroupById'
    | 'getGroupMetaByName'
    | 'publishWhitelistChanged'
    | 'touchGroupUpdatedAt'
    | 'withTransaction'
  > = defaultManagementDependencies
): Promise<GroupsResult<{ id: string; name: string }>> {
  const source = await deps.getGroupById(input.sourceGroupId);
  if (!source) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }

  const trimmedName = input.name?.trim();
  const baseName = trimmedName ?? `${source.name}-copy`;
  const name = await findAvailableGroupName(baseName, deps);

  try {
    const id = await deps.withTransaction(async (tx) => {
      const createdGroupId = await deps.createGroup(
        name,
        input.displayName,
        {
          visibility: 'private',
          ownerUserId: input.ownerUserId,
        },
        tx
      );

      await deps.copyRulesToGroup({ fromGroupId: source.id, toGroupId: createdGroupId }, tx);
      await deps.touchGroupUpdatedAt(createdGroupId, tx);
      return createdGroupId;
    });

    deps.publishWhitelistChanged(id);
    return { ok: true, data: { id, name } };
  } catch (error) {
    if (error instanceof Error && error.message === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return {
        ok: false,
        error: { code: 'CONFLICT', message: 'A group with this name already exists' },
      };
    }

    throw error;
  }
}

export async function getStats(
  deps: Pick<GroupsManagementDependencies, 'getStats'> = defaultManagementDependencies
): Promise<GroupStats> {
  return deps.getStats();
}

export async function getSystemStatus(
  deps: Pick<GroupsManagementDependencies, 'getSystemStatus'> = defaultManagementDependencies
): Promise<SystemStatus> {
  return deps.getSystemStatus();
}

export async function toggleSystemStatus(
  enable: boolean,
  deps: Pick<
    GroupsManagementDependencies,
    'publishAllWhitelistsChanged' | 'toggleSystemStatus'
  > = defaultManagementDependencies
): Promise<SystemStatus> {
  const result = await deps.toggleSystemStatus(enable);
  deps.publishAllWhitelistsChanged();
  return result;
}

export async function exportGroup(
  groupId: string,
  deps: Pick<
    GroupsManagementDependencies,
    'exportGroup' | 'getGroupById'
  > = defaultManagementDependencies
): Promise<GroupsResult<ExportResult>> {
  const group = await deps.getGroupById(groupId);
  if (!group) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }

  const content = await deps.exportGroup(groupId);
  if (!content) {
    return {
      ok: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to export group' },
    };
  }

  return { ok: true, data: { name: group.name, content } };
}

export async function exportAllGroups(
  deps: Pick<GroupsManagementDependencies, 'exportAllGroups'> = defaultManagementDependencies
): Promise<ExportResult[]> {
  return deps.exportAllGroups();
}

export const GroupsManagementService = {
  cloneGroup,
  createGroup,
  deleteGroup,
  exportAllGroups,
  exportGroup,
  getStats,
  getSystemStatus,
  toggleSystemStatus,
  updateGroup,
};

export default GroupsManagementService;
