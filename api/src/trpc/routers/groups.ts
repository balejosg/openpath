/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Groups Router - tRPC router for whitelist groups and rules management
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure, teacherProcedure } from '../trpc.js';
import { GroupsService } from '../../services/groups.service.js';
import * as auth from '../../lib/auth.js';
import * as roleStorage from '../../lib/role-storage.js';
import type { JWTPayload } from '../../lib/auth.js';
import { validateRuleValue } from '@openpath/shared';

function canAccessGroup(
  user: JWTPayload,
  group: { id: string; name: string; ownerUserId?: string | null }
): boolean {
  // Admins can access everything (handled inside canApproveGroup)
  if (group.ownerUserId && group.ownerUserId === user.sub) return true;
  return auth.canApproveGroup(user, group.id) || auth.canApproveGroup(user, group.name);
}

function canViewGroup(
  user: JWTPayload,
  group: { id: string; name: string; visibility?: string | null; ownerUserId?: string | null }
): boolean {
  if (canAccessGroup(user, group)) return true;
  return group.visibility === 'instance_public';
}

async function assertCanAccessGroupId(user: JWTPayload, groupId: string): Promise<void> {
  // Fast path: role stores group IDs
  if (auth.canApproveGroup(user, groupId)) return;

  // Slow path: role stores group names
  const groupResult = await GroupsService.getGroupById(groupId);
  if (!groupResult.ok) {
    throw new TRPCError({ code: groupResult.error.code, message: groupResult.error.message });
  }

  const group = groupResult.data;

  if (group.ownerUserId && group.ownerUserId === user.sub) return;
  if (auth.canApproveGroup(user, group.name)) return;
  throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this group' });
}

async function assertCanViewGroupId(user: JWTPayload, groupId: string): Promise<void> {
  // Fast path: role stores group IDs/names
  if (auth.canApproveGroup(user, groupId)) return;

  // Try by ID
  const groupResult = await GroupsService.getGroupById(groupId);
  if (groupResult.ok) {
    if (canViewGroup(user, groupResult.data)) return;
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this group' });
  }

  if (groupResult.error.code !== 'NOT_FOUND') {
    throw new TRPCError({ code: groupResult.error.code, message: groupResult.error.message });
  }

  // Try by name (legacy)
  const normalized = groupId.endsWith('.txt') ? groupId.slice(0, -4) : groupId;
  const byName = await GroupsService.getGroupByName(normalized);
  if (!byName.ok) {
    throw new TRPCError({ code: byName.error.code, message: byName.error.message });
  }

  if (canViewGroup(user, byName.data)) return;
  throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this group' });
}

function getInputStringField(input: unknown, key: string): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function addGroupToTeacherRole(params: {
  userId: string;
  groupId: string;
  createdBy: string;
}): Promise<void> {
  const existingRoles = await roleStorage.getUserRoles(params.userId);
  const teacherRole = existingRoles.find((r) => r.role === 'teacher');

  if (!teacherRole) {
    await roleStorage.assignRole({
      userId: params.userId,
      role: 'teacher',
      groupIds: [params.groupId],
      createdBy: params.createdBy,
    });
    return;
  }

  const current = Array.isArray(teacherRole.groupIds) ? teacherRole.groupIds : [];
  if (current.includes(params.groupId)) return;
  await roleStorage.addGroupsToRole(teacherRole.id, [params.groupId]);
}

const teacherGroupIdProcedure = <TSchema extends z.ZodTypeAny>(
  schema: TSchema
): ReturnType<typeof teacherProcedure.input<TSchema>> => {
  return teacherProcedure.input(schema).use(async ({ ctx, input, next }) => {
    const groupId = getInputStringField(input, 'groupId');
    if (!groupId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'groupId is required' });
    }
    await assertCanAccessGroupId(ctx.user, groupId);
    return next({ ctx });
  });
};

const teacherGroupByIdProcedure = <TSchema extends z.ZodTypeAny>(
  schema: TSchema
): ReturnType<typeof teacherProcedure.input<TSchema>> => {
  return teacherProcedure.input(schema).use(async ({ ctx, input, next }) => {
    const groupId = getInputStringField(input, 'id');
    if (!groupId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'id is required' });
    }
    await assertCanAccessGroupId(ctx.user, groupId);
    return next({ ctx });
  });
};

const teacherViewGroupIdProcedure = <TSchema extends z.ZodTypeAny>(
  schema: TSchema
): ReturnType<typeof teacherProcedure.input<TSchema>> => {
  return teacherProcedure.input(schema).use(async ({ ctx, input, next }) => {
    const groupId = getInputStringField(input, 'groupId');
    if (!groupId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'groupId is required' });
    }
    await assertCanViewGroupId(ctx.user, groupId);
    return next({ ctx });
  });
};

// =============================================================================
// Input Schemas
// =============================================================================

const RuleTypeSchema = z.enum(['whitelist', 'blocked_subdomain', 'blocked_path']);

const GroupVisibilitySchema = z.enum(['private', 'instance_public']);

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(100),
  displayName: z.string().min(1).max(255),
});

const CloneGroupSchema = z.object({
  sourceGroupId: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  displayName: z.string().min(1).max(255).optional(),
});

const UpdateGroupSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(255),
  enabled: z.boolean(),
  visibility: GroupVisibilitySchema.optional(),
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

const ListRulesGroupedSchema = z.object({
  groupId: z.string().min(1),
  type: RuleTypeSchema.optional(),
  limit: z.number().min(1).max(50).optional().default(20), // Limit on domain groups
  offset: z.number().min(0).optional().default(0),
  search: z.string().optional(),
});

const UpdateRuleSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1),
  value: z.string().min(1).max(500).optional(),
  comment: z.string().max(500).nullable().optional(),
});

const CreateRuleSchema = z
  .object({
    groupId: z.string().min(1),
    type: RuleTypeSchema,
    value: z.string().min(1).max(500),
    comment: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    const result = validateRuleValue(data.value, data.type);
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: result.error ?? 'Invalid rule value',
      });
    }
  });

const BulkCreateRulesSchema = z
  .object({
    groupId: z.string().min(1),
    type: RuleTypeSchema,
    values: z.array(z.string().min(1).max(500)),
  })
  .superRefine((data, ctx) => {
    data.values.forEach((value, i) => {
      const result = validateRuleValue(value, data.type);
      if (!result.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['values', i],
          message: result.error ?? 'Invalid rule value',
        });
      }
    });
  });

const BulkDeleteRulesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

// =============================================================================
// Router
// =============================================================================

export const groupsRouter = router({
  /**
   * List all groups with rule counts.
   * @returns Array of groups with whitelistCount, blockedSubdomainCount, blockedPathCount
   */
  list: teacherProcedure.query(async ({ ctx }) => {
    const groups = await GroupsService.listGroups();
    return groups.filter((g) => canAccessGroup(ctx.user, g));
  }),

  /**
   * List instance-public groups for browsing/cloning.
   */
  libraryList: teacherProcedure.query(async () => {
    const groups = await GroupsService.listGroups();
    return groups.filter((g) => g.visibility === 'instance_public');
  }),

  /**
   * Clone a group into a new private group.
   */
  clone: teacherProcedure.input(CloneGroupSchema).mutation(async ({ ctx, input }) => {
    await assertCanViewGroupId(ctx.user, input.sourceGroupId);

    const byId = await GroupsService.getGroupById(input.sourceGroupId);
    const sourceResult = byId.ok ? byId : await GroupsService.getGroupByName(input.sourceGroupId);
    if (!sourceResult.ok) {
      throw new TRPCError({ code: sourceResult.error.code, message: sourceResult.error.message });
    }

    const source = sourceResult.data;

    if (!canViewGroup(ctx.user, source)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this group' });
    }

    const result = await GroupsService.cloneGroup({
      sourceGroupId: source.id,
      name: input.name,
      displayName: input.displayName ?? `${source.displayName} Copy`,
      ownerUserId: ctx.user.sub,
    });
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }

    if (!auth.isAdminToken(ctx.user)) {
      await addGroupToTeacherRole({
        userId: ctx.user.sub,
        groupId: result.data.id,
        createdBy: ctx.user.sub,
      });
    }

    return result.data;
  }),

  /**
   * Get a group by ID.
   * @param id - Group ID
   * @returns Group with rule counts
   * @throws NOT_FOUND if group doesn't exist
   */
  getById: teacherProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const result = await GroupsService.getGroupById(input.id);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }

      if (!canViewGroup(ctx.user, result.data)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this group' });
      }
      return result.data;
    }),

  /**
   * Get a group by name.
   * @param name - Group name (slug)
   * @returns Group with rule counts
   * @throws NOT_FOUND if group doesn't exist
   */
  getByName: teacherProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const result = await GroupsService.getGroupByName(input.name);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }

      if (!canViewGroup(ctx.user, result.data)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this group' });
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
  create: teacherProcedure.input(CreateGroupSchema).mutation(async ({ input, ctx }) => {
    const isAdmin = auth.isAdminToken(ctx.user);
    const result = await GroupsService.createGroup({
      ...input,
      visibility: 'private',
      ownerUserId: ctx.user.sub,
    });
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }

    if (!isAdmin) {
      await addGroupToTeacherRole({
        userId: ctx.user.sub,
        groupId: result.data.id,
        createdBy: ctx.user.sub,
      });
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
  update: teacherGroupByIdProcedure(UpdateGroupSchema).mutation(async ({ input }) => {
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
  listRules: teacherViewGroupIdProcedure(ListRulesSchema).query(async ({ input }) => {
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
  listRulesPaginated: teacherViewGroupIdProcedure(ListRulesPaginatedSchema).query(
    async ({ input }) => {
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
    }
  ),

  /**
   * List rules for a group, grouped by root domain, with pagination on groups.
   * This ensures domain groups are never split across pages.
   * @param groupId - Group ID
   * @param type - Optional rule type filter
   * @param limit - Max number of domain groups to return (default 20)
   * @param offset - Number of domain groups to skip (default 0)
   * @param search - Optional search string to filter by value
   * @returns { groups, totalGroups, totalRules, hasMore }
   * @throws NOT_FOUND if group doesn't exist
   */
  listRulesGrouped: teacherViewGroupIdProcedure(ListRulesGroupedSchema).query(async ({ input }) => {
    const result = await GroupsService.listRulesGrouped({
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
  createRule: teacherGroupIdProcedure(CreateRuleSchema).mutation(async ({ input }) => {
    const result = await GroupsService.createRule({
      groupId: input.groupId,
      type: input.type,
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
  deleteRule: teacherProcedure
    .input(z.object({ id: z.string().min(1), groupId: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      let resolvedGroupId = input.groupId;

      // Enforce group access for teachers (admins can delete without group resolution)
      if (!auth.isAdminToken(ctx.user)) {
        // Never trust client-supplied groupId for authorization. Resolve from the rule itself.
        const rule = await GroupsService.getRuleById(input.id);
        resolvedGroupId = rule?.groupId;

        if (resolvedGroupId) {
          await assertCanAccessGroupId(ctx.user, resolvedGroupId);
        }
      }

      const result = await GroupsService.deleteRule(input.id, resolvedGroupId);
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
  updateRule: teacherGroupIdProcedure(UpdateRuleSchema).mutation(async ({ input }) => {
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
  bulkCreateRules: teacherGroupIdProcedure(BulkCreateRulesSchema).mutation(async ({ input }) => {
    const result = await GroupsService.bulkCreateRules({
      groupId: input.groupId,
      type: input.type,
      values: input.values,
    });
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  /**
   * Bulk delete rules.
   * @param ids - Array of rule IDs to delete (max 100)
   * @returns { deleted: number, rules: Rule[] } - Count and deleted rules for undo
   */
  bulkDeleteRules: teacherProcedure
    .input(BulkDeleteRulesSchema)
    .mutation(async ({ input, ctx }) => {
      let preloadedRules: Awaited<ReturnType<typeof GroupsService.getRulesByIds>> | undefined;

      if (!auth.isAdminToken(ctx.user)) {
        preloadedRules = await GroupsService.getRulesByIds(input.ids);
        const groupIds = new Set(preloadedRules.map((r) => r.groupId));
        for (const gid of groupIds) {
          await assertCanAccessGroupId(ctx.user, gid);
        }
      }

      const result = await GroupsService.bulkDeleteRules(
        input.ids,
        preloadedRules ? { rules: preloadedRules } : undefined
      );
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
  export: teacherGroupIdProcedure(z.object({ groupId: z.string().min(1) })).query(
    async ({ input }) => {
      const result = await GroupsService.exportGroup(input.groupId);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }
  ),

  /**
   * Export all groups to file content.
   * @returns Array of { name, content } for each group
   */
  exportAll: adminProcedure.query(async () => {
    return GroupsService.exportAllGroups();
  }),
});

export default groupsRouter;
