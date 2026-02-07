/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Settings Storage - Key-value store for system configuration
 * Uses the 'settings' table for persistent storage.
 */

import { eq } from 'drizzle-orm';
import { db, settings } from '../db/index.js';
import { logger } from './logger.js';

// =============================================================================
// Known Setting Keys (type-safe constants)
// =============================================================================

export const SETTING_KEYS = {
  LAST_BACKUP_AT: 'last_backup_at',
  LAST_BACKUP_SIZE: 'last_backup_size',
  LAST_BACKUP_STATUS: 'last_backup_status',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

// =============================================================================
// Public API
// =============================================================================

/**
 * Get a setting value by key
 */
export async function getSetting(key: string): Promise<string | null> {
  try {
    const result = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);

    return result[0]?.value ?? null;
  } catch (error) {
    logger.error('Failed to get setting', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Set a setting value (upsert)
 */
export async function setSetting(key: string, value: string): Promise<boolean> {
  try {
    await db
      .insert(settings)
      .values({
        key,
        value,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value,
          updatedAt: new Date(),
        },
      });

    logger.debug('Setting updated', { key });
    return true;
  } catch (error) {
    logger.error('Failed to set setting', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Delete a setting
 */
export async function deleteSetting(key: string): Promise<boolean> {
  try {
    const result = await db.delete(settings).where(eq(settings.key, key));
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    logger.error('Failed to delete setting', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Get multiple settings by keys
 */
export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  try {
    const result = await db.select({ key: settings.key, value: settings.value }).from(settings);

    const keySet = new Set(keys);
    const values: Record<string, string> = {};

    for (const row of result) {
      if (keySet.has(row.key)) {
        values[row.key] = row.value;
      }
    }

    return values;
  } catch (error) {
    logger.error('Failed to get settings', {
      keys,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

// =============================================================================
// Backup-specific helpers
// =============================================================================

export interface BackupInfo {
  lastBackupAt: string | null;
  lastBackupSize: string | null;
  lastBackupStatus: 'success' | 'failed' | null;
}

/**
 * Get backup information from settings
 */
export async function getBackupInfo(): Promise<BackupInfo> {
  const values = await getSettings([
    SETTING_KEYS.LAST_BACKUP_AT,
    SETTING_KEYS.LAST_BACKUP_SIZE,
    SETTING_KEYS.LAST_BACKUP_STATUS,
  ]);

  return {
    lastBackupAt: values[SETTING_KEYS.LAST_BACKUP_AT] ?? null,
    lastBackupSize: values[SETTING_KEYS.LAST_BACKUP_SIZE] ?? null,
    lastBackupStatus:
      (values[SETTING_KEYS.LAST_BACKUP_STATUS] as 'success' | 'failed' | undefined) ?? null,
  };
}

/**
 * Record a backup completion
 */
export async function recordBackup(
  status: 'success' | 'failed',
  sizeBytes?: number
): Promise<boolean> {
  const timestamp = new Date().toISOString();

  const results = await Promise.all([
    setSetting(SETTING_KEYS.LAST_BACKUP_AT, timestamp),
    setSetting(SETTING_KEYS.LAST_BACKUP_STATUS, status),
    sizeBytes !== undefined
      ? setSetting(SETTING_KEYS.LAST_BACKUP_SIZE, String(sizeBytes))
      : Promise.resolve(true),
  ]);

  const allSuccess = results.every((r) => r);

  if (allSuccess) {
    logger.info('Backup recorded', { status, sizeBytes, timestamp });
  }

  return allSuccess;
}
