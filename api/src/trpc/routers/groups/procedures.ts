import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { teacherProcedure } from '../../trpc.js';
import type { GroupsServiceError } from '../../../services/groups-service-shared.js';
import { GroupsService } from '../../../services/groups.service.js';
import type { JWTPayload } from '../../../lib/auth.js';

export function throwServiceError(error: GroupsServiceError): never {
  throw new TRPCError({ code: error.code, message: error.message });
}

export async function assertCanAccessGroupId(user: JWTPayload, groupId: string): Promise<void> {
  const access = await GroupsService.ensureUserCanAccessGroupId(user, groupId);
  if (!access.ok) {
    throwServiceError(access.error);
  }
}

export async function assertCanViewGroupId(user: JWTPayload, groupId: string): Promise<void> {
  const access = await GroupsService.ensureUserCanViewGroupId(user, groupId);
  if (!access.ok) {
    throwServiceError(access.error);
  }
}

export const teacherGroupIdProcedure = <TSchema extends z.ZodType>(
  schema: TSchema
): ReturnType<typeof teacherProcedure.input<TSchema>> => {
  return teacherProcedure.input(schema).use(async ({ ctx, input, next }) => {
    const inputRecord = input as Record<string, unknown>;
    const groupId =
      typeof input === 'object' && input !== null && typeof inputRecord.groupId === 'string'
        ? inputRecord.groupId
        : null;

    if (!groupId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'groupId is required' });
    }

    await assertCanAccessGroupId(ctx.user, groupId);
    return next({ ctx });
  });
};

export const teacherGroupByIdProcedure = <TSchema extends z.ZodType>(
  schema: TSchema
): ReturnType<typeof teacherProcedure.input<TSchema>> => {
  return teacherProcedure.input(schema).use(async ({ ctx, input, next }) => {
    const inputRecord = input as Record<string, unknown>;
    const groupId =
      typeof input === 'object' && input !== null && typeof inputRecord.id === 'string'
        ? inputRecord.id
        : null;

    if (!groupId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'id is required' });
    }

    await assertCanAccessGroupId(ctx.user, groupId);
    return next({ ctx });
  });
};

export const teacherViewGroupIdProcedure = <TSchema extends z.ZodType>(
  schema: TSchema
): ReturnType<typeof teacherProcedure.input<TSchema>> => {
  return teacherProcedure.input(schema).use(async ({ ctx, input, next }) => {
    const inputRecord = input as Record<string, unknown>;
    const groupId =
      typeof input === 'object' && input !== null && typeof inputRecord.groupId === 'string'
        ? inputRecord.groupId
        : null;

    if (!groupId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'groupId is required' });
    }

    await assertCanViewGroupId(ctx.user, groupId);
    return next({ ctx });
  });
};
