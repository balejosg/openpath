/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * GroupsService - Business logic for whitelist groups and rules management
 */

import * as groupsStorage from '../lib/groups-storage.js';
import type {
  GroupWithCounts,
  Rule,
  RuleType,
  GroupStats,
  SystemStatus,
  PaginatedRulesResult,
  ListRulesOptions,
} from '../lib/groups-storage.js';

// =============================================================================
// Types
// =============================================================================

/** Standard tRPC error codes for easy mapping */
export type GroupsServiceError =
  | { code: 'BAD_REQUEST'; message: string }
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'CONFLICT'; message: string }
  | { code: 'INTERNAL_SERVER_ERROR'; message: string };

export type GroupsResult<T> = { ok: true; data: T } | { ok: false; error: GroupsServiceError };

export interface CreateGroupInput {
  name: string;
  displayName: string;
}

export interface UpdateGroupInput {
  id: string;
  displayName: string;
  enabled: boolean;
}

export interface CreateRuleInput {
  groupId: string;
  type: RuleType;
  value: string;
  comment?: string | undefined;
}

export interface BulkCreateRulesInput {
  groupId: string;
  type: RuleType;
  values: string[];
}

export interface UpdateRuleInput {
  id: string;
  groupId: string;
  value?: string | undefined;
  comment?: string | null | undefined;
}

export interface ExportResult {
  name: string;
  content: string;
}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * List all groups with their rule counts.
 */
export async function listGroups(): Promise<GroupWithCounts[]> {
  return groupsStorage.getAllGroups();
}

/**
 * Get a group by ID.
 */
export async function getGroupById(id: string): Promise<GroupsResult<GroupWithCounts>> {
  const group = await groupsStorage.getGroupById(id);
  if (!group) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }
  return { ok: true, data: group };
}

/**
 * Get a group by name.
 */
export async function getGroupByName(name: string): Promise<GroupsResult<GroupWithCounts>> {
  const group = await groupsStorage.getGroupByName(name);
  if (!group) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }
  return { ok: true, data: group };
}

/**
 * Create a new group.
 */
export async function createGroup(
  input: CreateGroupInput
): Promise<GroupsResult<{ id: string; name: string }>> {
  // Validate input
  if (!input.name || input.name.trim() === '') {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'Name is required' } };
  }
  if (!input.displayName || input.displayName.trim() === '') {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'Display name is required' } };
  }

  // Sanitize name for URL safety
  const safeName = input.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');

  try {
    const id = await groupsStorage.createGroup(safeName, input.displayName);
    return { ok: true, data: { id, name: safeName } };
  } catch (err) {
    if (err instanceof Error && err.message === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return {
        ok: false,
        error: { code: 'CONFLICT', message: 'A group with this name already exists' },
      };
    }
    throw err;
  }
}

/**
 * Update a group.
 */
export async function updateGroup(input: UpdateGroupInput): Promise<GroupsResult<GroupWithCounts>> {
  // Check if group exists
  const existing = await groupsStorage.getGroupById(input.id);
  if (!existing) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }

  await groupsStorage.updateGroup(input.id, input.displayName, input.enabled);

  const updated = await groupsStorage.getGroupById(input.id);
  if (!updated) {
    return {
      ok: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch updated group' },
    };
  }

  return { ok: true, data: updated };
}

/**
 * Delete a group.
 */
export async function deleteGroup(id: string): Promise<GroupsResult<{ deleted: boolean }>> {
  const existing = await groupsStorage.getGroupById(id);
  if (!existing) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }

  const deleted = await groupsStorage.deleteGroup(id);
  return { ok: true, data: { deleted } };
}

/**
 * List rules for a group.
 */
export async function listRules(groupId: string, type?: RuleType): Promise<GroupsResult<Rule[]>> {
  const group = await groupsStorage.getGroupById(groupId);
  if (!group) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }

  const rules = await groupsStorage.getRulesByGroup(groupId, type);
  return { ok: true, data: rules };
}

/**
 * List rules for a group with pagination.
 */
export async function listRulesPaginated(
  options: ListRulesOptions
): Promise<GroupsResult<PaginatedRulesResult>> {
  const group = await groupsStorage.getGroupById(options.groupId);
  if (!group) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }

  const result = await groupsStorage.getRulesByGroupPaginated(options);
  return { ok: true, data: result };
}

/**
 * Create a rule.
 */
export async function createRule(input: CreateRuleInput): Promise<GroupsResult<{ id: string }>> {
  // Validate input
  if (!input.value || input.value.trim() === '') {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'Value is required' } };
  }

  // Check if group exists
  const group = await groupsStorage.getGroupById(input.groupId);
  if (!group) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }

  const result = await groupsStorage.createRule(
    input.groupId,
    input.type,
    input.value,
    input.comment ?? null
  );

  if (!result.success) {
    return {
      ok: false,
      error: { code: 'CONFLICT', message: result.error ?? 'Rule already exists' },
    };
  }

  if (!result.id) {
    return {
      ok: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create rule' },
    };
  }

  return { ok: true, data: { id: result.id } };
}

/**
 * Delete a rule.
 */
export async function deleteRule(id: string): Promise<GroupsResult<{ deleted: boolean }>> {
  const deleted = await groupsStorage.deleteRule(id);
  return { ok: true, data: { deleted } };
}

/**
 * Bulk delete rules.
 */
export async function bulkDeleteRules(
  ids: string[]
): Promise<GroupsResult<{ deleted: number; rules: Rule[] }>> {
  if (ids.length === 0) {
    return { ok: true, data: { deleted: 0, rules: [] } };
  }

  // Get the rules before deleting (for undo functionality)
  const rules = await groupsStorage.getRulesByIds(ids);

  const deleted = await groupsStorage.bulkDeleteRules(ids);
  return { ok: true, data: { deleted, rules } };
}

/**
 * Update a rule.
 */
export async function updateRule(input: UpdateRuleInput): Promise<GroupsResult<Rule>> {
  // Check if group exists
  const group = await groupsStorage.getGroupById(input.groupId);
  if (!group) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }

  // Check if rule exists
  const existingRule = await groupsStorage.getRuleById(input.id);
  if (!existingRule) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } };
  }

  // Verify rule belongs to the group
  if (existingRule.groupId !== input.groupId) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'Rule does not belong to this group' },
    };
  }

  const updated = await groupsStorage.updateRule({
    id: input.id,
    value: input.value,
    comment: input.comment,
  });

  if (!updated) {
    return {
      ok: false,
      error: { code: 'CONFLICT', message: 'A rule with this value already exists' },
    };
  }

  return { ok: true, data: updated };
}

/**
 * Bulk create rules.
 */
export async function bulkCreateRules(
  input: BulkCreateRulesInput
): Promise<GroupsResult<{ count: number }>> {
  // Check if group exists
  const group = await groupsStorage.getGroupById(input.groupId);
  if (!group) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }

  const count = await groupsStorage.bulkCreateRules(input.groupId, input.type, input.values);
  return { ok: true, data: { count } };
}

/**
 * Get group statistics.
 */
export async function getStats(): Promise<GroupStats> {
  return groupsStorage.getStats();
}

/**
 * Get system status.
 */
export async function getSystemStatus(): Promise<SystemStatus> {
  return groupsStorage.getSystemStatus();
}

/**
 * Toggle system status (enable/disable all groups).
 */
export async function toggleSystemStatus(enable: boolean): Promise<SystemStatus> {
  return groupsStorage.toggleSystemStatus(enable);
}

/**
 * Export a group to file content.
 */
export async function exportGroup(groupId: string): Promise<GroupsResult<ExportResult>> {
  const group = await groupsStorage.getGroupById(groupId);
  if (!group) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
  }

  const content = await groupsStorage.exportGroup(groupId);
  if (!content) {
    return {
      ok: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to export group' },
    };
  }

  return { ok: true, data: { name: group.name, content } };
}

/**
 * Export all groups.
 */
export async function exportAllGroups(): Promise<ExportResult[]> {
  return groupsStorage.exportAllGroups();
}

// =============================================================================
// Default Export
// =============================================================================

export const GroupsService = {
  listGroups,
  getGroupById,
  getGroupByName,
  createGroup,
  updateGroup,
  deleteGroup,
  listRules,
  listRulesPaginated,
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

export default GroupsService;
