/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Backup Router - Endpoints for backup status and recording
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, sharedSecretProcedure } from '../trpc.js';
import BackupService from '../../services/backup.service.js';

export const backupRouter = router({
  /**
   * Backup status is intentionally not exposed as a product surface.
   */
  status: publicProcedure.query(() => {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Backup status is not available in this release',
    });
  }),

  /**
   * Record a backup completion (requires shared secret - called by backup scripts)
   */
  record: sharedSecretProcedure
    .input(
      z.object({
        status: z.enum(['success', 'failed']),
        sizeBytes: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await BackupService.recordBackupCompletion(input);
    }),
});
