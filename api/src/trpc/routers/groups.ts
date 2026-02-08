/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Groups Router - tRPC router for whitelist groups and rules management
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '../trpc.js';
import { GroupsService } from '../../services/groups.service.js';
import type { RuleType } from '../../lib/groups-storage.js';

// =============================================================================
// Input Schemas
// =============================================================================

const RuleTypeSchema = z.enum(['whitelist', 'blocked_subdomain', 'blocked_path']);

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(100),
  displayName: z.string().min(1).max(255),
});

const UpdateGroupSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(255),
  enabled: z.boolean(),
});

const ListRulesSchema = z.object({
  groupId: z.string().min(1),
  type: RuleTypeSchema.optional(),
});

const ListRulesPaginatedSchema = z.object({
  groupId: z.string().min(1),
  type: RuleTypeSchema.optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
  search: z.string().optional(),
});

const UpdateRuleSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1),
  value: z.string().min(1).max(500).optional(),
  comment: z.string().max(500).nullable().optional(),
});

const CreateRuleSchema = z.object({
  groupId: z.string().min(1),
  type: RuleTypeSchema,
  value: z.string().min(1).max(500),
  comment: z.string().max(500).optional(),
});

const BulkCreateRulesSchema = z.object({
  groupId: z.string().min(1),
  type: RuleTypeSchema,
  values: z.array(z.string().min(1).max(500)),
});

// =============================================================================
// Router
// =============================================================================

export const groupsRouter = router({
  /**
   * List all groups with rule counts.
   * @returns Array of groups with whitelistCount, blockedSubdomainCount, blockedPathCount
   */
  list: adminProcedure.query(async () => {
    return GroupsService.listGroups();
  }),

  /**
   * Get a group by ID.
   * @param id - Group ID
   * @returns Group with rule counts
   * @throws NOT_FOUND if group doesn't exist
   */
  getById: adminProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ input }) => {
    const result = await GroupsService.getGroupById(input.id);
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  /**
   * Get a group by name.
   * @param name - Group name (slug)
   * @returns Group with rule counts
   * @throws NOT_FOUND if group doesn't exist
   */
  getByName: adminProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ input }) => {
      const result = await GroupsService.getGroupByName(input.name);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  /**
   * Create a new group.
   * @param name - Group name (will be sanitized to URL-safe slug)
   * @param displayName - Human-readable display name
   * @returns Created group ID and sanitized name
   * @throws CONFLICT if group with same name already exists
   */
  create: adminProcedure.input(CreateGroupSchema).mutation(async ({ input }) => {
    const result = await GroupsService.createGroup(input);
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  /**
   * Update a group.
   * @param id - Group ID
   * @param displayName - New display name
   * @param enabled - Whether group is enabled
   * @returns Updated group
   * @throws NOT_FOUND if group doesn't exist
   */
  update: adminProcedure.input(UpdateGroupSchema).mutation(async ({ input }) => {
    const result = await GroupsService.updateGroup(input);
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  /**
   * Delete a group and all its rules.
   * @param id - Group ID
   * @returns { deleted: boolean }
   * @throws NOT_FOUND if group doesn't exist
   */
  delete: adminProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ input }) => {
    const result = await GroupsService.deleteGroup(input.id);
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  /**
   * List rules for a group.
   * @param groupId - Group ID
   * @param type - Optional rule type filter
   * @returns Array of rules sorted by value
   * @throws NOT_FOUND if group doesn't exist
   */
  listRules: adminProcedure.input(ListRulesSchema).query(async ({ input }) => {
    const result = await GroupsService.listRules(input.groupId, input.type);
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  /**
   * List rules for a group with pagination.
   * @param groupId - Group ID
   * @param type - Optional rule type filter
   * @param limit - Max number of rules to return (default 50)
   * @param offset - Number of rules to skip (default 0)
   * @param search - Optional search string to filter by value
   * @returns { rules, total, hasMore }
   * @throws NOT_FOUND if group doesn't exist
   */
  listRulesPaginated: adminProcedure.input(ListRulesPaginatedSchema).query(async ({ input }) => {
    const result = await GroupsService.listRulesPaginated({
      groupId: input.groupId,
      type: input.type,
      limit: input.limit,
      offset: input.offset,
      search: input.search,
    });
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  /**
   * Create a rule in a group.
   * @param groupId - Group ID
   * @param type - Rule type (whitelist, blocked_subdomain, blocked_path)
   * @param value - Rule value (domain, subdomain pattern, or path)
   * @param comment - Optional comment
   * @returns Created rule ID
   * @throws NOT_FOUND if group doesn't exist
   * @throws CONFLICT if rule already exists
   */
  createRule: adminProcedure.input(CreateRuleSchema).mutation(async ({ input }) => {
    const result = await GroupsService.createRule({
      groupId: input.groupId,
      type: input.type as RuleType,
      value: input.value,
      comment: input.comment,
    });
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  /**
   * Delete a rule.
   * @param id - Rule ID
   * @param groupId - Optional Group ID for compatibility
   * @returns { deleted: boolean }
   */
  deleteRule: adminProcedure
    .input(z.object({ id: z.string().min(1), groupId: z.string().optional() }))
    .mutation(async ({ input }) => {
      const result = await GroupsService.deleteRule(input.id);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  /**
   * Update a rule.
   * @param id - Rule ID
   * @param groupId - Group ID
   * @param value - New rule value (optional)
   * @param comment - New comment (optional)
   * @returns Updated rule
   * @throws NOT_FOUND if rule or group doesn't exist
   * @throws CONFLICT if new value already exists
   */
  updateRule: adminProcedure.input(UpdateRuleSchema).mutation(async ({ input }) => {
    const result = await GroupsService.updateRule({
      id: input.id,
      groupId: input.groupId,
      value: input.value,
      comment: input.comment,
    });
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  /**
   * Bulk create rules in a group.
   * @param groupId - Group ID
   * @param type - Rule type
   * @param values - Array of rule values
   * @returns { count: number } - Number of rules successfully created
   * @throws NOT_FOUND if group doesn't exist
   */
  bulkCreateRules: adminProcedure.input(BulkCreateRulesSchema).mutation(async ({ input }) => {
    const result = await GroupsService.bulkCreateRules({
      groupId: input.groupId,
      type: input.type as RuleType,
      values: input.values,
    });
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  /**
   * Get aggregate statistics for all groups.
   * @returns { groupCount, whitelistCount, blockedCount }
   */
  stats: adminProcedure.query(async () => {
    return GroupsService.getStats();
  }),

  /**
   * Get system status (enabled/disabled groups).
   * @returns { enabled, totalGroups, activeGroups, pausedGroups }
   */
  systemStatus: adminProcedure.query(async () => {
    return GroupsService.getSystemStatus();
  }),

  /**
   * Toggle system status (enable/disable all groups).
   * @param enable - Whether to enable or disable all groups
   * @returns Updated system status
   */
  toggleSystem: adminProcedure
    .input(z.object({ enable: z.boolean() }))
    .mutation(async ({ input }) => {
      return GroupsService.toggleSystemStatus(input.enable);
    }),

  /**
   * Export a group to file content.
   * @param groupId - Group ID
   * @returns { name, content } - Group name and file content
   * @throws NOT_FOUND if group doesn't exist
   */
  export: adminProcedure
    .input(z.object({ groupId: z.string().min(1) }))
    .query(async ({ input }) => {
      const result = await GroupsService.exportGroup(input.groupId);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  /**
   * Export all groups to file content.
   * @returns Array of { name, content } for each group
   */
  exportAll: adminProcedure.query(async () => {
    return GroupsService.exportAllGroups();
  }),
});

export default groupsRouter;
