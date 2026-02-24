/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Groups Storage - PostgreSQL-based whitelist groups and rules management using Drizzle ORM
 */

import { v4 as uuidv4 } from 'uuid';
import { eq, and, inArray } from 'drizzle-orm';
import { normalize, getRootDomain } from '@openpath/shared';
import { db, whitelistGroups, whitelistRules } from '../db/index.js';
import { logger } from './logger.js';
import type { WhitelistGroup, WhitelistRule } from '../db/schema.js';

// =============================================================================
// Export Cache
// =============================================================================

interface ExportCacheEntry {
  version: string;
  content: string;
}

const EXPORT_CACHE_MAX = ((): number => {
  const raw = process.env.OPENPATH_EXPORT_CACHE_MAX;
  if (!raw) return 5000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 5000;
})();

// Keyed by groupId (LRU by Map insertion order)
const exportCache = new Map<string, ExportCacheEntry>();

// =============================================================================
// Types
// =============================================================================

/** Rule type for whitelist entries */
export type RuleType = 'whitelist' | 'blocked_subdomain' | 'blocked_path';

/** Rule source for whitelist entries */
export type RuleSource = 'manual' | 'auto_extension';

/** Group visibility scope */
export type GroupVisibility = 'private' | 'instance_public';

/** Group with computed rule counts */
export interface GroupWithCounts {
  id: string;
  name: string;
  displayName: string;
  enabled: boolean;
  visibility: GroupVisibility;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string | null;
  whitelistCount: number;
  blockedSubdomainCount: number;
  blockedPathCount: number;
}

/** Minimal group metadata for exports/caching */
export interface GroupMeta {
  id: string;
  name: string;
  displayName: string;
  enabled: boolean;
  visibility: GroupVisibility;
  ownerUserId: string | null;
  updatedAt: Date;
}

/** Rule in API format */
export interface Rule {
  id: string;
  groupId: string;
  type: RuleType;
  value: string;
  source: RuleSource;
  comment: string | null;
  createdAt: string;
}

/** Result of creating a rule */
export interface CreateRuleResult {
  success: boolean;
  id?: string;
  error?: string;
}

/** Group statistics */
export interface GroupStats {
  groupCount: number;
  whitelistCount: number;
  blockedCount: number;
}

/** System status (enabled/disabled groups) */
export interface SystemStatus {
  enabled: boolean;
  totalGroups: number;
  activeGroups: number;
  pausedGroups: number;
}

/** Paginated rules query options */
export interface ListRulesOptions {
  groupId: string;
  type?: RuleType | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  search?: string | undefined;
}

/** Paginated rules result */
export interface PaginatedRulesResult {
  rules: Rule[];
  total: number;
  hasMore: boolean;
}

/** A domain group containing rules under a root domain */
export interface DomainGroup {
  root: string;
  rules: Rule[];
  status: 'allowed' | 'blocked' | 'mixed';
}

/** Paginated grouped rules query options */
export interface ListRulesGroupedOptions {
  groupId: string;
  type?: RuleType | undefined;
  limit?: number | undefined; // Limit on number of root domain groups
  offset?: number | undefined; // Offset in root domain groups
  search?: string | undefined;
}

/** Paginated grouped rules result */
export interface PaginatedGroupedRulesResult {
  groups: DomainGroup[];
  totalGroups: number; // Total number of root domain groups
  totalRules: number; // Total number of rules across all groups
  hasMore: boolean;
}

/** Update rule input */
export interface UpdateRuleInput {
  id: string;
  value?: string | undefined;
  comment?: string | null | undefined;
}

/** Storage interface for dependency injection and testing */
export interface IGroupsStorage {
  getAllGroups(): Promise<GroupWithCounts[]>;
  getGroupById(id: string): Promise<GroupWithCounts | null>;
  getGroupByName(name: string): Promise<GroupWithCounts | null>;
  createGroup(
    name: string,
    displayName: string,
    opts?: {
      enabled?: boolean;
      visibility?: GroupVisibility;
      ownerUserId?: string | null;
    }
  ): Promise<string>;
  updateGroup(
    id: string,
    displayName: string,
    enabled: boolean,
    visibility?: GroupVisibility
  ): Promise<void>;
  deleteGroup(id: string): Promise<boolean>;
  getRulesByGroup(groupId: string, type?: RuleType): Promise<Rule[]>;
  getRulesByGroupPaginated(options: ListRulesOptions): Promise<PaginatedRulesResult>;
  getRulesByGroupGrouped(options: ListRulesGroupedOptions): Promise<PaginatedGroupedRulesResult>;
  getRuleById(id: string): Promise<Rule | null>;
  getRulesByIds(ids: string[]): Promise<Rule[]>;
  createRule(
    groupId: string,
    type: RuleType,
    value: string,
    comment?: string | null,
    source?: RuleSource
  ): Promise<CreateRuleResult>;
  updateRule(input: UpdateRuleInput): Promise<Rule | null>;
  deleteRule(id: string): Promise<boolean>;
  bulkCreateRules(
    groupId: string,
    type: RuleType,
    values: string[],
    source?: RuleSource
  ): Promise<number>;
  bulkDeleteRules(ids: string[]): Promise<number>;
  getStats(): Promise<GroupStats>;
  getSystemStatus(): Promise<SystemStatus>;
  toggleSystemStatus(enable: boolean): Promise<SystemStatus>;
  exportGroup(groupId: string): Promise<string | null>;
  exportAllGroups(): Promise<{ name: string; content: string }[]>;
}

// =============================================================================
// Helper Functions
// =============================================================================

function dbGroupToApi(
  g: WhitelistGroup
): Omit<GroupWithCounts, 'whitelistCount' | 'blockedSubdomainCount' | 'blockedPathCount'> {
  return {
    id: g.id,
    name: g.name,
    displayName: g.displayName,
    enabled: g.enabled === 1,
    visibility: g.visibility === 'instance_public' ? 'instance_public' : 'private',
    ownerUserId: g.ownerUserId ?? null,
    createdAt: g.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: g.updatedAt?.toISOString() ?? null,
  };
}

function dbGroupToMeta(g: WhitelistGroup): GroupMeta {
  return {
    id: g.id,
    name: g.name,
    displayName: g.displayName,
    enabled: g.enabled === 1,
    visibility: g.visibility === 'instance_public' ? 'instance_public' : 'private',
    ownerUserId: g.ownerUserId ?? null,
    updatedAt: g.updatedAt ?? new Date(),
  };
}

function dbRuleToApi(r: WhitelistRule): Rule {
  return {
    id: r.id,
    groupId: r.groupId,
    type: r.type as RuleType,
    value: r.value,
    source: (r.source as RuleSource | null) ?? 'manual',
    comment: r.comment ?? null,
    createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

// =============================================================================
// Groups CRUD
// =============================================================================

/**
 * Get all groups with their rule counts.
 */
export async function getAllGroups(): Promise<GroupWithCounts[]> {
  const groups = await db.select().from(whitelistGroups);
  const rules = await db.select().from(whitelistRules);

  return groups.map((g) => {
    const groupRules = rules.filter((r) => r.groupId === g.id);
    return {
      ...dbGroupToApi(g),
      whitelistCount: groupRules.filter((r) => r.type === 'whitelist').length,
      blockedSubdomainCount: groupRules.filter((r) => r.type === 'blocked_subdomain').length,
      blockedPathCount: groupRules.filter((r) => r.type === 'blocked_path').length,
    };
  });
}

/**
 * Get a single group by ID with rule counts.
 */
export async function getGroupById(id: string): Promise<GroupWithCounts | null> {
  const [group] = await db.select().from(whitelistGroups).where(eq(whitelistGroups.id, id));
  if (!group) return null;

  const rules = await db.select().from(whitelistRules).where(eq(whitelistRules.groupId, id));
  return {
    ...dbGroupToApi(group),
    whitelistCount: rules.filter((r) => r.type === 'whitelist').length,
    blockedSubdomainCount: rules.filter((r) => r.type === 'blocked_subdomain').length,
    blockedPathCount: rules.filter((r) => r.type === 'blocked_path').length,
  };
}

/**
 * Get minimal group metadata by ID (fast path for agent downloads).
 */
export async function getGroupMetaById(id: string): Promise<GroupMeta | null> {
  const [group] = await db
    .select()
    .from(whitelistGroups)
    .where(eq(whitelistGroups.id, id))
    .limit(1);
  if (!group) return null;
  return dbGroupToMeta(group);
}

/**
 * Get minimal group metadata by name.
 */
export async function getGroupMetaByName(name: string): Promise<GroupMeta | null> {
  const [group] = await db
    .select()
    .from(whitelistGroups)
    .where(eq(whitelistGroups.name, name))
    .limit(1);
  if (!group) return null;
  return dbGroupToMeta(group);
}

/**
 * Touch a group's updatedAt to reflect export-relevant changes.
 */
export async function touchGroupUpdatedAt(id: string): Promise<void> {
  await db.update(whitelistGroups).set({ updatedAt: new Date() }).where(eq(whitelistGroups.id, id));
}

/**
 * Get a single group by name.
 */
export async function getGroupByName(name: string): Promise<GroupWithCounts | null> {
  const [group] = await db.select().from(whitelistGroups).where(eq(whitelistGroups.name, name));
  if (!group) return null;

  const rules = await db.select().from(whitelistRules).where(eq(whitelistRules.groupId, group.id));
  return {
    ...dbGroupToApi(group),
    whitelistCount: rules.filter((r) => r.type === 'whitelist').length,
    blockedSubdomainCount: rules.filter((r) => r.type === 'blocked_subdomain').length,
    blockedPathCount: rules.filter((r) => r.type === 'blocked_path').length,
  };
}

/**
 * Create a new group.
 *
 * @param name - URL-safe group name (slug)
 * @param displayName - Human-readable display name
 * @returns The created group ID
 * @throws Error if a group with the same name already exists
 */
export async function createGroup(
  name: string,
  displayName: string,
  opts?: {
    enabled?: boolean;
    visibility?: GroupVisibility;
    ownerUserId?: string | null;
  }
): Promise<string> {
  const existing = await getGroupByName(name);
  if (existing) {
    throw new Error('UNIQUE_CONSTRAINT_VIOLATION');
  }

  const id = uuidv4();
  const enabled = opts?.enabled === false ? 0 : 1;
  const visibility = opts?.visibility ?? 'private';
  const ownerUserId = opts?.ownerUserId ?? null;

  await db.insert(whitelistGroups).values({
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

/**
 * Update a group's display name and enabled status.
 */
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

/**
 * Delete a group and all its rules (cascade).
 */
export async function deleteGroup(id: string): Promise<boolean> {
  const result = await db.delete(whitelistGroups).where(eq(whitelistGroups.id, id));
  const deleted = (result.rowCount ?? 0) > 0;
  if (deleted) {
    logger.debug('Deleted group', { id });
  }
  return deleted;
}

/**
 * Copy all rules from one group to another.
 *
 * Note: destination group should be empty to avoid unique constraint conflicts.
 */
export async function copyRulesToGroup(params: {
  fromGroupId: string;
  toGroupId: string;
}): Promise<number> {
  const source = await db
    .select()
    .from(whitelistRules)
    .where(eq(whitelistRules.groupId, params.fromGroupId));

  if (source.length === 0) return 0;

  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < source.length; i += BATCH_SIZE) {
    const batch = source.slice(i, i + BATCH_SIZE).map((r) => ({
      id: uuidv4(),
      groupId: params.toGroupId,
      type: r.type,
      value: r.value,
      source: (r.source as RuleSource | null) ?? 'manual',
      comment: r.comment ?? null,
    }));

    await db.insert(whitelistRules).values(batch);
    inserted += batch.length;
  }

  return inserted;
}

// =============================================================================
// Rules CRUD
// =============================================================================

/**
 * Get all rules for a group, optionally filtered by type.
 */
export async function getRulesByGroup(groupId: string, type?: RuleType): Promise<Rule[]> {
  let rules: WhitelistRule[];
  if (type) {
    rules = await db
      .select()
      .from(whitelistRules)
      .where(and(eq(whitelistRules.groupId, groupId), eq(whitelistRules.type, type)));
  } else {
    rules = await db.select().from(whitelistRules).where(eq(whitelistRules.groupId, groupId));
  }

  return rules.map(dbRuleToApi).sort((a, b) => a.value.localeCompare(b.value));
}

/**
 * Get rules for a group with pagination, filtering, and search.
 */
export async function getRulesByGroupPaginated(
  options: ListRulesOptions
): Promise<PaginatedRulesResult> {
  const { groupId, type, limit = 50, offset = 0, search } = options;

  // Get all rules for the group (we filter in memory for search)
  let rules: WhitelistRule[];
  if (type) {
    rules = await db
      .select()
      .from(whitelistRules)
      .where(and(eq(whitelistRules.groupId, groupId), eq(whitelistRules.type, type)));
  } else {
    rules = await db.select().from(whitelistRules).where(eq(whitelistRules.groupId, groupId));
  }

  // Apply search filter if provided
  let filtered = rules;
  if (search?.trim()) {
    const searchLower = search.toLowerCase().trim();
    filtered = rules.filter((r) => r.value.toLowerCase().includes(searchLower));
  }

  // Sort by value
  filtered.sort((a, b) => a.value.localeCompare(b.value));

  // Calculate total before pagination
  const total = filtered.length;

  // Apply pagination
  const paginated = filtered.slice(offset, offset + limit);

  return {
    rules: paginated.map(dbRuleToApi),
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Get rules for a group, grouped by root domain, with pagination on groups.
 * This ensures domain groups are never split across pages.
 */
export async function getRulesByGroupGrouped(
  options: ListRulesGroupedOptions
): Promise<PaginatedGroupedRulesResult> {
  const { groupId, type, limit = 20, offset = 0, search } = options;

  // Get all rules for the group
  let rules: WhitelistRule[];
  if (type) {
    rules = await db
      .select()
      .from(whitelistRules)
      .where(and(eq(whitelistRules.groupId, groupId), eq(whitelistRules.type, type)));
  } else {
    rules = await db.select().from(whitelistRules).where(eq(whitelistRules.groupId, groupId));
  }

  // Apply search filter if provided
  let filtered = rules;
  if (search?.trim()) {
    const searchLower = search.toLowerCase().trim();
    filtered = rules.filter((r) => r.value.toLowerCase().includes(searchLower));
  }

  // Group rules by root domain
  const groupedMap = new Map<string, WhitelistRule[]>();
  for (const rule of filtered) {
    const root = getRootDomain(rule.value);
    const existing = groupedMap.get(root) ?? [];
    existing.push(rule);
    groupedMap.set(root, existing);
  }

  // Sort root domains alphabetically
  const sortedRoots = Array.from(groupedMap.keys()).sort((a, b) => a.localeCompare(b));

  // Calculate totals before pagination
  const totalGroups = sortedRoots.length;
  const totalRules = filtered.length;

  // Apply pagination on groups (not individual rules)
  const paginatedRoots = sortedRoots.slice(offset, offset + limit);

  // Build domain groups with status
  const groups: DomainGroup[] = paginatedRoots.map((root) => {
    const groupRules = groupedMap.get(root) ?? [];
    // Sort rules within group alphabetically
    groupRules.sort((a, b) => a.value.localeCompare(b.value));

    // Determine status based on rule types
    const hasWhitelist = groupRules.some((r) => r.type === 'whitelist');
    const hasBlocked = groupRules.some(
      (r) => r.type === 'blocked_subdomain' || r.type === 'blocked_path'
    );

    let status: 'allowed' | 'blocked' | 'mixed';
    if (hasWhitelist && hasBlocked) {
      status = 'mixed';
    } else if (hasBlocked) {
      status = 'blocked';
    } else {
      status = 'allowed';
    }

    return {
      root,
      rules: groupRules.map(dbRuleToApi),
      status,
    };
  });

  return {
    groups,
    totalGroups,
    totalRules,
    hasMore: offset + limit < totalGroups,
  };
}

/**
 * Get a single rule by ID.
 */
export async function getRuleById(id: string): Promise<Rule | null> {
  const [rule] = await db.select().from(whitelistRules).where(eq(whitelistRules.id, id));
  if (!rule) return null;
  return dbRuleToApi(rule);
}

/**
 * Get multiple rules by IDs.
 */
export async function getRulesByIds(ids: string[]): Promise<Rule[]> {
  if (ids.length === 0) return [];

  const uniqueIds = Array.from(new Set(ids));
  const rows = await db.select().from(whitelistRules).where(inArray(whitelistRules.id, uniqueIds));

  if (rows.length === 0) return [];

  const rulesById = new Map<string, Rule>();
  for (const row of rows) {
    rulesById.set(row.id, dbRuleToApi(row));
  }

  // Preserve input ordering (and duplicates) while omitting missing IDs.
  const ordered: Rule[] = [];
  for (const id of ids) {
    const rule = rulesById.get(id);
    if (rule) ordered.push(rule);
  }

  return ordered;
}

/**
 * Update a rule's value and/or comment.
 */
export async function updateRule(input: UpdateRuleInput): Promise<Rule | null> {
  const { id, value, comment } = input;

  // Get existing rule
  const [existing] = await db.select().from(whitelistRules).where(eq(whitelistRules.id, id));
  if (!existing) return null;

  // Build update object
  const updates: Partial<{ value: string; comment: string | null }> = {};

  if (value !== undefined) {
    const normalizedValue = normalize.domain(value);

    // Check for duplicates if changing value
    const [duplicate] = await db
      .select()
      .from(whitelistRules)
      .where(
        and(
          eq(whitelistRules.groupId, existing.groupId),
          eq(whitelistRules.type, existing.type),
          eq(whitelistRules.value, normalizedValue)
        )
      );

    if (duplicate && duplicate.id !== id) {
      // Duplicate exists with different ID, cannot update
      return null;
    }

    updates.value = normalizedValue;
  }

  if (comment !== undefined) {
    updates.comment = comment;
  }

  // Only update if there's something to update
  if (Object.keys(updates).length > 0) {
    await db.update(whitelistRules).set(updates).where(eq(whitelistRules.id, id));
    logger.debug('Updated rule', { id, ...updates });
  }

  // Return updated rule
  return getRuleById(id);
}

/**
 * Create a new rule in a group.
 */
export async function createRule(
  groupId: string,
  type: RuleType,
  value: string,
  comment: string | null = null,
  source: RuleSource = 'manual'
): Promise<CreateRuleResult> {
  const normalizedValue = normalize.domain(value);

  // Check for existing rule
  const [existing] = await db
    .select()
    .from(whitelistRules)
    .where(
      and(
        eq(whitelistRules.groupId, groupId),
        eq(whitelistRules.type, type),
        eq(whitelistRules.value, normalizedValue)
      )
    );

  if (existing) {
    return { success: false, error: 'Rule already exists' };
  }

  const id = uuidv4();
  await db.insert(whitelistRules).values({
    id,
    groupId,
    type,
    value: normalizedValue,
    source,
    comment,
  });

  logger.debug('Created rule', { id, groupId, type, value: normalizedValue, source });
  return { success: true, id };
}

/**
 * Delete a rule by ID.
 */
export async function deleteRule(id: string): Promise<boolean> {
  const result = await db.delete(whitelistRules).where(eq(whitelistRules.id, id));
  return (result.rowCount ?? 0) > 0;
}

/**
 * Bulk delete rules by IDs.
 *
 * @param ids - Array of rule IDs to delete
 * @returns Number of rules deleted
 */
export async function bulkDeleteRules(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;

  const uniqueIds = Array.from(new Set(ids));
  const result = await db.delete(whitelistRules).where(inArray(whitelistRules.id, uniqueIds));

  const deletedCount = result.rowCount ?? 0;
  logger.debug('Bulk deleted rules', { count: deletedCount, requested: ids.length });
  return deletedCount;
}

/**
 * Bulk create rules in a group.
 *
 * @returns Number of rules successfully created
 */
export async function bulkCreateRules(
  groupId: string,
  type: RuleType,
  values: string[],
  source: RuleSource = 'manual'
): Promise<number> {
  let count = 0;
  for (const value of values) {
    const trimmed = normalize.domain(value);
    if (trimmed) {
      const result = await createRule(groupId, type, trimmed, null, source);
      if (result.success) count++;
    }
  }
  return count;
}

// =============================================================================
// Stats & System Status
// =============================================================================

/**
 * Get aggregate statistics for all groups.
 */
export async function getStats(): Promise<GroupStats> {
  const groups = await db.select().from(whitelistGroups);
  const rules = await db.select().from(whitelistRules);

  return {
    groupCount: groups.length,
    whitelistCount: rules.filter((r) => r.type === 'whitelist').length,
    blockedCount: rules.filter((r) => r.type === 'blocked_subdomain' || r.type === 'blocked_path')
      .length,
  };
}

/**
 * Get system status (enabled/disabled groups).
 */
export async function getSystemStatus(): Promise<SystemStatus> {
  const groups = await db.select().from(whitelistGroups);
  const hasEnabledGroups = groups.some((g) => g.enabled === 1);

  return {
    enabled: hasEnabledGroups,
    totalGroups: groups.length,
    activeGroups: groups.filter((g) => g.enabled === 1).length,
    pausedGroups: groups.filter((g) => g.enabled === 0).length,
  };
}

/**
 * Toggle all groups on or off.
 */
export async function toggleSystemStatus(enable: boolean): Promise<SystemStatus> {
  const newStatus = enable ? 1 : 0;
  await db.update(whitelistGroups).set({ enabled: newStatus, updatedAt: new Date() });

  logger.info('System status toggled', { enabled: enable });
  return getSystemStatus();
}

// =============================================================================
// Export Functions
// =============================================================================

/**
 * Export a group to whitelist file content.
 *
 * @param groupId - Group ID to export
 * @returns File content as string, or null if group not found
 */
export async function exportGroup(groupId: string): Promise<string | null> {
  const group = await getGroupMetaById(groupId);
  if (!group) return null;

  const version = `${group.updatedAt.toISOString()}:${group.enabled ? '1' : '0'}`;
  const cached = exportCache.get(groupId);
  const hit = cached?.version === version ? cached : null;
  if (hit) {
    // LRU: refresh order
    exportCache.delete(groupId);
    exportCache.set(groupId, hit);
    return hit.content;
  }

  const rules = await getRulesByGroup(groupId);
  let content = '';

  if (!group.enabled) {
    content = '#DESACTIVADO\n\n';
  }

  const whitelist = rules.filter((r) => r.type === 'whitelist');
  if (whitelist.length > 0) {
    content += '## WHITELIST\n';
    whitelist.forEach((r) => (content += `${r.value}\n`));
    content += '\n';
  }

  const blockedSub = rules.filter((r) => r.type === 'blocked_subdomain');
  if (blockedSub.length > 0) {
    content += '## BLOCKED-SUBDOMAINS\n';
    blockedSub.forEach((r) => (content += `${r.value}\n`));
    content += '\n';
  }

  const blockedPath = rules.filter((r) => r.type === 'blocked_path');
  if (blockedPath.length > 0) {
    content += '## BLOCKED-PATHS\n';
    blockedPath.forEach((r) => (content += `${r.value}\n`));
    content += '\n';
  }

  const finalContent = content.trim() + '\n';
  exportCache.delete(groupId);
  exportCache.set(groupId, { version, content: finalContent });

  // Evict least-recently used entries
  while (exportCache.size > EXPORT_CACHE_MAX) {
    const oldestKey = exportCache.keys().next().value;
    if (oldestKey === undefined) break;
    exportCache.delete(oldestKey);
  }

  return finalContent;
}

/**
 * Export all groups to whitelist file content.
 *
 * @returns Array of objects with group name and file content
 */
export async function exportAllGroups(): Promise<{ name: string; content: string }[]> {
  const groups = await getAllGroups();
  const results: { name: string; content: string }[] = [];

  for (const g of groups) {
    const content = await exportGroup(g.id);
    if (content) {
      results.push({ name: g.name, content });
    }
  }

  return results;
}

// =============================================================================
// Domain Blocking Functions
// =============================================================================

/**
 * Result of a domain block check.
 */
export interface BlockedCheckResult {
  blocked: boolean;
  matchedRule: string | null;
}

/**
 * Check if a domain is blocked by blocked_subdomain rules in a specific group.
 *
 * @param groupId - Group ID to check rules against
 * @param domain - Domain to check
 * @returns Object with blocked status and matched rule if any
 */
export async function isDomainBlocked(
  groupId: string,
  domain: string
): Promise<BlockedCheckResult> {
  const rules = await getRulesByGroup(groupId, 'blocked_subdomain');
  const domainLower = normalize.domain(domain);

  for (const rule of rules) {
    const pattern = rule.value.toLowerCase();

    // Exact match
    if (pattern === domainLower) {
      return { blocked: true, matchedRule: pattern };
    }

    // Subdomain match (e.g., "ads.example.com" blocked by "example.com")
    if (domainLower.endsWith('.' + pattern)) {
      return { blocked: true, matchedRule: pattern };
    }

    // Wildcard match (e.g., "*.example.com")
    if (pattern.startsWith('*.')) {
      const baseDomain = pattern.slice(2);
      if (domainLower === baseDomain || domainLower.endsWith('.' + baseDomain)) {
        return { blocked: true, matchedRule: pattern };
      }
    }
  }

  return { blocked: false, matchedRule: null };
}

/**
 * Get all blocked subdomain rules for a specific group.
 *
 * @param groupId - Group ID to get blocked subdomains for
 * @returns Array of blocked subdomain patterns
 */
export async function getBlockedSubdomains(groupId: string): Promise<string[]> {
  const rules = await getRulesByGroup(groupId, 'blocked_subdomain');
  return rules.map((r) => r.value);
}

// =============================================================================
// Storage Instance
// =============================================================================

export const groupsStorage: IGroupsStorage = {
  getAllGroups,
  getGroupById,
  getGroupByName,
  createGroup,
  updateGroup,
  deleteGroup,
  getRulesByGroup,
  getRulesByGroupPaginated,
  getRulesByGroupGrouped,
  getRuleById,
  getRulesByIds,
  createRule,
  updateRule,
  deleteRule,
  bulkCreateRules,
  bulkDeleteRules,
  getStats,
  getSystemStatus,
  toggleSystemStatus,
  exportGroup,
  exportAllGroups,
};

logger.debug('Groups storage initialized');

export default groupsStorage;
