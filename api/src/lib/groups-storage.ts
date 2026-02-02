/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Groups Storage - PostgreSQL-based whitelist groups and rules management using Drizzle ORM
 */

import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { normalize } from '@openpath/shared';
import { db, whitelistGroups, whitelistRules } from '../db/index.js';
import { logger } from './logger.js';
import type { WhitelistGroup, WhitelistRule } from '../db/schema.js';

// =============================================================================
// Types
// =============================================================================

/** Rule type for whitelist entries */
export type RuleType = 'whitelist' | 'blocked_subdomain' | 'blocked_path';

/** Group with computed rule counts */
export interface GroupWithCounts {
  id: string;
  name: string;
  displayName: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string | null;
  whitelistCount: number;
  blockedSubdomainCount: number;
  blockedPathCount: number;
}

/** Rule in API format */
export interface Rule {
  id: string;
  groupId: string;
  type: RuleType;
  value: string;
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

/** Storage interface for dependency injection and testing */
export interface IGroupsStorage {
  getAllGroups(): Promise<GroupWithCounts[]>;
  getGroupById(id: string): Promise<GroupWithCounts | null>;
  getGroupByName(name: string): Promise<GroupWithCounts | null>;
  createGroup(name: string, displayName: string): Promise<string>;
  updateGroup(id: string, displayName: string, enabled: boolean): Promise<void>;
  deleteGroup(id: string): Promise<boolean>;
  getRulesByGroup(groupId: string, type?: RuleType): Promise<Rule[]>;
  createRule(
    groupId: string,
    type: RuleType,
    value: string,
    comment?: string | null
  ): Promise<CreateRuleResult>;
  deleteRule(id: string): Promise<boolean>;
  bulkCreateRules(groupId: string, type: RuleType, values: string[]): Promise<number>;
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
    createdAt: g.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: g.updatedAt?.toISOString() ?? null,
  };
}

function dbRuleToApi(r: WhitelistRule): Rule {
  return {
    id: r.id,
    groupId: r.groupId,
    type: r.type as RuleType,
    value: r.value,
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
export async function createGroup(name: string, displayName: string): Promise<string> {
  const existing = await getGroupByName(name);
  if (existing) {
    throw new Error('UNIQUE_CONSTRAINT_VIOLATION');
  }

  const id = uuidv4();
  await db.insert(whitelistGroups).values({
    id,
    name,
    displayName,
    enabled: 1,
  });

  logger.debug('Created group', { id, name });
  return id;
}

/**
 * Update a group's display name and enabled status.
 */
export async function updateGroup(
  id: string,
  displayName: string,
  enabled: boolean
): Promise<void> {
  await db
    .update(whitelistGroups)
    .set({
      displayName,
      enabled: enabled ? 1 : 0,
      updatedAt: new Date(),
    })
    .where(eq(whitelistGroups.id, id));

  logger.debug('Updated group', { id, displayName, enabled });
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
 * Create a new rule in a group.
 */
export async function createRule(
  groupId: string,
  type: RuleType,
  value: string,
  comment: string | null = null
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
    comment,
  });

  logger.debug('Created rule', { id, groupId, type, value: normalizedValue });
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
 * Bulk create rules in a group.
 *
 * @returns Number of rules successfully created
 */
export async function bulkCreateRules(
  groupId: string,
  type: RuleType,
  values: string[]
): Promise<number> {
  let count = 0;
  for (const value of values) {
    const trimmed = normalize.domain(value);
    if (trimmed) {
      const result = await createRule(groupId, type, trimmed);
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
  const group = await getGroupById(groupId);
  if (!group) return null;

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

  return content.trim() + '\n';
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
  createRule,
  deleteRule,
  bulkCreateRules,
  getStats,
  getSystemStatus,
  toggleSystemStatus,
  exportGroup,
  exportAllGroups,
};

logger.debug('Groups storage initialized');

export default groupsStorage;
