import { z } from 'zod';
import { router, publicProcedure, adminProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { CreateUserDTOSchema } from '../../types/index.js';
import { SetupService } from '../../services/index.js';

export const setupRouter = router({
  status: publicProcedure.query(async () => {
    return SetupService.getStatus();
  }),

  createFirstAdmin: publicProcedure.input(CreateUserDTOSchema).mutation(async ({ input }) => {
    const result = await SetupService.createFirstAdmin(input);

    if (!result.ok) {
      const errorMap: Record<string, 'FORBIDDEN' | 'CONFLICT' | 'BAD_REQUEST'> = {
        SETUP_ALREADY_COMPLETED: 'FORBIDDEN',
        EMAIL_EXISTS: 'CONFLICT',
        INVALID_INPUT: 'BAD_REQUEST',
      };
      throw new TRPCError({
        code: errorMap[result.error.code] ?? 'BAD_REQUEST',
        message: result.error.message,
      });
    }

    return result.data;
  }),

  validateToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      return SetupService.validateToken(input.token);
    }),

  getRegistrationToken: adminProcedure.query(async () => {
    const result = await SetupService.getRegistrationToken();
    if (!result.ok) {
      throw new TRPCError({ code: 'NOT_FOUND', message: result.error.message });
    }
    return result.data;
  }),

  regenerateToken: adminProcedure.mutation(async () => {
    const result = await SetupService.regenerateToken();
    if (!result.ok) {
      throw new TRPCError({ code: 'NOT_FOUND', message: result.error.message });
    }
    return result.data;
  }),
});
