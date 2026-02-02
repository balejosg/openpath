import { z } from 'zod';
import { router, adminProcedure } from '../trpc.js';
import { UserRoleSchema, CreateUserDTOSchema } from '../../types/index.js';
import { TRPCError } from '@trpc/server';
import { UserService } from '../../services/index.js';
import * as roleStorage from '../../lib/role-storage.js';

export const usersRouter = router({
  list: adminProcedure.query(async () => {
    return await UserService.listUsers();
  }),

  get: adminProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const result = await UserService.getUser(input.id);
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  create: adminProcedure
    .input(
      CreateUserDTOSchema.extend({
        role: UserRoleSchema.optional(),
        groupIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      // First check email
      const check = await UserService.getUserByEmail(input.email);
      if (check) throw new TRPCError({ code: 'CONFLICT', message: 'Email exists' });

      const result = await UserService.register(input);
      if (!result.ok)
        throw new TRPCError({ code: result.error.code, message: result.error.message });

      const user = result.data.user;
      if (input.role) {
        await UserService.assignRole(user.id, input.role, input.groupIds ?? []);
      }

      const final = await UserService.getUser(user.id);
      if (!final.ok) throw new TRPCError({ code: final.error.code, message: final.error.message });
      return final.data;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        active: z.boolean().optional(),
        password: z.string().min(8).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      const result = await UserService.updateUser(id, updates);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }

      const final = await UserService.getUser(id);
      if (!final.ok) throw new TRPCError({ code: final.error.code, message: final.error.message });
      return final.data;
    }),

  delete: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    if (ctx.user.sub === input.id) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete yourself' });
    }
    const result = await UserService.deleteUser(input.id);
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  // Role management
  assignRole: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: UserRoleSchema,
        groupIds: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ input }) => {
      const result = await UserService.assignRole(input.userId, input.role, input.groupIds);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  revokeRole: adminProcedure
    .input(z.object({ userId: z.string(), roleId: z.string() }))
    .mutation(async ({ input }) => {
      const result = await UserService.revokeRole(input.roleId);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  listTeachers: adminProcedure.query(async () => await roleStorage.getAllTeachers()),
});
