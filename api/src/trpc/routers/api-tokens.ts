/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * API token surface intentionally removed for this launch.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { router, protectedProcedure } from '../trpc.js';

function removedSurfaceError(): never {
  throw new TRPCError({
    code: 'NOT_FOUND',
    message: 'API token management is not available in this release',
  });
}

const RevokeTokenSchema = z.object({
  id: z.string().min(1),
});

export const apiTokensRouter = router({
  list: protectedProcedure.query(() => removedSurfaceError()),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        expiresInDays: z.number().int().positive().max(365).optional(),
      })
    )
    .mutation(() => removedSurfaceError()),
  revoke: protectedProcedure.input(RevokeTokenSchema).mutation(() => removedSurfaceError()),
  regenerate: protectedProcedure.input(RevokeTokenSchema).mutation(() => removedSurfaceError()),
});
