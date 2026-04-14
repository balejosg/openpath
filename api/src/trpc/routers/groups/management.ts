import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { adminProcedure, teacherProcedure } from '../../trpc.js';
import * as auth from '../../../lib/auth.js';
import { GroupsService } from '../../../services/groups.service.js';
import UserService from '../../../services/user.service.js';
import {
  assertCanViewGroupId,
  teacherGroupByIdProcedure,
  throwServiceError,
} from './procedures.js';
import { CloneGroupSchema, CreateGroupSchema, UpdateGroupSchema } from './schemas.js';

export const groupManagementProcedures = {
  clone: teacherProcedure.input(CloneGroupSchema).mutation(async ({ ctx, input }) => {
    await assertCanViewGroupId(ctx.user, input.sourceGroupId);

    const byId = await GroupsService.getGroupById(input.sourceGroupId);
    const sourceResult = byId.ok ? byId : await GroupsService.getGroupByName(input.sourceGroupId);
    if (!sourceResult.ok) {
      throwServiceError(sourceResult.error);
    }

    const source = sourceResult.data;
    if (!GroupsService.canUserViewGroup(ctx.user, source)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this group' });
    }

    const result = await GroupsService.cloneGroup({
      sourceGroupId: source.id,
      name: input.name,
      displayName: input.displayName ?? `${source.displayName} Copy`,
      ownerUserId: ctx.user.sub,
    });
    if (!result.ok) {
      throwServiceError(result.error);
    }

    if (!auth.isAdminToken(ctx.user)) {
      await UserService.ensureTeacherRoleGroupAccess({
        userId: ctx.user.sub,
        groupId: result.data.id,
        createdBy: ctx.user.sub,
      });
    }

    return result.data;
  }),

  create: teacherProcedure.input(CreateGroupSchema).mutation(async ({ input, ctx }) => {
    const result = await GroupsService.createGroup({
      ...input,
      visibility: 'private',
      ownerUserId: ctx.user.sub,
    });
    if (!result.ok) {
      throwServiceError(result.error);
    }

    if (!auth.isAdminToken(ctx.user)) {
      await UserService.ensureTeacherRoleGroupAccess({
        userId: ctx.user.sub,
        groupId: result.data.id,
        createdBy: ctx.user.sub,
      });
    }

    return result.data;
  }),

  update: teacherGroupByIdProcedure(UpdateGroupSchema).mutation(async ({ input }) => {
    const result = await GroupsService.updateGroup(input);
    if (!result.ok) {
      throwServiceError(result.error);
    }
    return result.data;
  }),

  delete: adminProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ input }) => {
    const result = await GroupsService.deleteGroup(input.id);
    if (!result.ok) {
      throwServiceError(result.error);
    }
    return result.data;
  }),

  toggleSystem: adminProcedure
    .input(z.object({ enable: z.boolean() }))
    .mutation(async ({ input }) => {
      return GroupsService.toggleSystemStatus(input.enable);
    }),
};
