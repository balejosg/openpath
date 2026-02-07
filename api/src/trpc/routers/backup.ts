/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Backup Router - Endpoints for backup status and recording
 */

import { z } from 'zod';
import { router, publicProcedure, sharedSecretProcedure } from '../trpc.js';
import { getBackupInfo, recordBackup } from '../../lib/settings-storage.js';

export const backupRouter = router({
  /**
   * Get backup status (public - used by Settings page)
   */
  status: publicProcedure.query(async () => {
    const info = await getBackupInfo();

    // Calculate human-readable "time ago" string
    let lastBackupHuman: string | null = null;
    if (info.lastBackupAt) {
      const backupDate = new Date(info.lastBackupAt);
      const now = new Date();
      const diffMs = now.getTime() - backupDate.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMinutes < 1) {
        lastBackupHuman = 'Hace menos de un minuto';
      } else if (diffMinutes < 60) {
        lastBackupHuman = `Hace ${String(diffMinutes)} ${diffMinutes === 1 ? 'minuto' : 'minutos'}`;
      } else if (diffHours < 24) {
        lastBackupHuman = `Hace ${String(diffHours)} ${diffHours === 1 ? 'hora' : 'horas'}`;
      } else {
        lastBackupHuman = `Hace ${String(diffDays)} ${diffDays === 1 ? 'día' : 'días'}`;
      }
    }

    // Format size if available
    let lastBackupSizeHuman: string | null = null;
    if (info.lastBackupSize) {
      const bytes = parseInt(info.lastBackupSize, 10);
      if (!isNaN(bytes)) {
        if (bytes < 1024) {
          lastBackupSizeHuman = `${String(bytes)} B`;
        } else if (bytes < 1024 * 1024) {
          lastBackupSizeHuman = `${(bytes / 1024).toFixed(1)} KB`;
        } else if (bytes < 1024 * 1024 * 1024) {
          lastBackupSizeHuman = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        } else {
          lastBackupSizeHuman = `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        }
      }
    }

    return {
      lastBackupAt: info.lastBackupAt,
      lastBackupHuman,
      lastBackupSize: info.lastBackupSize,
      lastBackupSizeHuman,
      lastBackupStatus: info.lastBackupStatus,
    };
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
      const success = await recordBackup(input.status, input.sizeBytes);

      if (!success) {
        return { success: false, error: 'Failed to record backup' };
      }

      return { success: true, recordedAt: new Date().toISOString() };
    }),
});
