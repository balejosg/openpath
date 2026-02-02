import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';
import * as auth from '../lib/auth.js';
import { logger } from '../lib/logger.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Authenticated procedure middleware
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Admin-only procedure middleware
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!auth.isAdminToken(ctx.user)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

// Teacher/Admin procedure middleware
export const teacherProcedure = protectedProcedure.use(({ ctx, next }) => {
  const roles = ctx.user.roles.map((r) => r.role);
  if (!roles.includes('admin') && !roles.includes('teacher')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Teacher access required' });
  }
  return next({ ctx });
});
// Shared secret procedure (for machines)
export const sharedSecretProcedure = t.procedure.use(({ ctx, next }) => {
  const secret = process.env.SHARED_SECRET;
  if (secret !== undefined && secret !== '') {
    const authHeader = ctx.req.headers.authorization;
    if (authHeader !== `Bearer ${secret}`) {
      logger.warn('Failed shared secret authentication attempt', {
        path: ctx.req.path,
        ip: ctx.req.ip,
      });
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid or missing shared secret' });
    }
  }
  return next({ ctx });
});
