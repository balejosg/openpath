import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db, whitelistGroups, whitelistRules } from '../db/index.js';
import type { DbExecutor } from '../db/index.js';
import { getRowCount } from './utils.js';
import { logger } from './logger.js';
import {
  dbGroupToApi,
  dbGroupToMeta,
  type GroupMeta,
  type GroupStats,
  type GroupVisibility,
  type GroupWithCounts,
  type SystemStatus,
} from './groups-storage-shared.js';

export async function getAllGroups(): Promise<GroupWithCounts[]> {
  const groups = await db.select().from(whitelistGroups);
  const rules = await db.select().from(whitelistRules);

  return groups.map((group) => {
    const groupRules = rules.filter((rule) => rule.groupId === group.id);
    return {
      ...dbGroupToApi(group),
      whitelistCount: groupRules.filter((rule) => rule.type === 'whitelist').length,
      blockedSubdomainCount: groupRules.filter((rule) => rule.type === 'blocked_subdomain').length,
      blockedPathCount: groupRules.filter((rule) => rule.type === 'blocked_path').length,
    };
  });
}

export async function getGroupById(id: string): Promise<GroupWithCounts | null> {
  const [group] = await db.select().from(whitelistGroups).where(eq(whitelistGroups.id, id));
  if (!group) return null;

  const rules = await db.select().from(whitelistRules).where(eq(whitelistRules.groupId, id));
  return {
    ...dbGroupToApi(group),
    whitelistCount: rules.filter((rule) => rule.type === 'whitelist').length,
    blockedSubdomainCount: rules.filter((rule) => rule.type === 'blocked_subdomain').length,
    blockedPathCount: rules.filter((rule) => rule.type === 'blocked_path').length,
  };
}

export async function getGroupMetaById(id: string): Promise<GroupMeta | null> {
  const [group] = await db
    .select()
    .from(whitelistGroups)
    .where(eq(whitelistGroups.id, id))
    .limit(1);
  if (!group) return null;
  return dbGroupToMeta(group);
}

export async function getGroupMetaByName(name: string): Promise<GroupMeta | null> {
  const [group] = await db
    .select()
    .from(whitelistGroups)
    .where(eq(whitelistGroups.name, name))
    .limit(1);
  if (!group) return null;
  return dbGroupToMeta(group);
}

export async function touchGroupUpdatedAt(id: string, executor: DbExecutor = db): Promise<void> {
  await executor
    .update(whitelistGroups)
    .set({ updatedAt: new Date() })
    .where(eq(whitelistGroups.id, id));
}

export async function getGroupByName(name: string): Promise<GroupWithCounts | null> {
  const [group] = await db.select().from(whitelistGroups).where(eq(whitelistGroups.name, name));
  if (!group) return null;

  const rules = await db.select().from(whitelistRules).where(eq(whitelistRules.groupId, group.id));
  return {
    ...dbGroupToApi(group),
    whitelistCount: rules.filter((rule) => rule.type === 'whitelist').length,
    blockedSubdomainCount: rules.filter((rule) => rule.type === 'blocked_subdomain').length,
    blockedPathCount: rules.filter((rule) => rule.type === 'blocked_path').length,
  };
}

export async function createGroup(
  name: string,
  displayName: string,
  opts?: {
    enabled?: boolean;
    visibility?: GroupVisibility;
    ownerUserId?: string | null;
  },
  executor: DbExecutor = db
): Promise<string> {
  const existing = await getGroupByName(name);
  if (existing) {
    throw new Error('UNIQUE_CONSTRAINT_VIOLATION');
  }

  const id = uuidv4();
  const enabled = opts?.enabled === false ? 0 : 1;
  const visibility = opts?.visibility ?? 'private';
  const ownerUserId = opts?.ownerUserId ?? null;

  await executor.insert(whitelistGroups).values({
    id,
    name,
    displayName,
    enabled,
    visibility,
    ownerUserId,
  });

  logger.debug('Created group', { id, name, visibility, ownerUserId });
  return id;
}

export async function updateGroup(
  id: string,
  displayName: string,
  enabled: boolean,
  visibility?: GroupVisibility
): Promise<void> {
  await db
    .update(whitelistGroups)
    .set({
      displayName,
      enabled: enabled ? 1 : 0,
      ...(visibility ? { visibility } : {}),
      updatedAt: new Date(),
    })
    .where(eq(whitelistGroups.id, id));

  logger.debug('Updated group', { id, displayName, enabled, visibility });
}

export async function deleteGroup(id: string): Promise<boolean> {
  const deleted =
    getRowCount(await db.delete(whitelistGroups).where(eq(whitelistGroups.id, id))) > 0;
  if (deleted) {
    logger.debug('Deleted group', { id });
  }
  return deleted;
}

export async function getStats(): Promise<GroupStats> {
  const groups = await db.select().from(whitelistGroups);
  const rules = await db.select().from(whitelistRules);

  return {
    groupCount: groups.length,
    whitelistCount: rules.filter((rule) => rule.type === 'whitelist').length,
    blockedCount: rules.filter(
      (rule) => rule.type === 'blocked_subdomain' || rule.type === 'blocked_path'
    ).length,
  };
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const groups = await db.select().from(whitelistGroups);
  const hasEnabledGroups = groups.some((group) => group.enabled === 1);

  return {
    enabled: hasEnabledGroups,
    totalGroups: groups.length,
    activeGroups: groups.filter((group) => group.enabled === 1).length,
    pausedGroups: groups.filter((group) => group.enabled === 0).length,
  };
}

export async function toggleSystemStatus(enable: boolean): Promise<SystemStatus> {
  const newStatus = enable ? 1 : 0;
  await db.update(whitelistGroups).set({ enabled: newStatus, updatedAt: new Date() });

  logger.info('System status toggled', { enabled: enable });
  return await getSystemStatus();
}
