import type { ExportResult, GroupsResult } from './groups-service-shared.js';
import {
  defaultManagementDependencies,
  type GroupsManagementDependencies,
} from './groups-management-shared.js';
import type { GroupStats, SystemStatus } from '../lib/groups-storage.js';

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
