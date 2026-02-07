import { router, publicProcedure } from '../trpc.js';
import { getStats } from '../../lib/user-storage.js';
import { logger } from '../../lib/logger.js';
import { getErrorMessage } from '@openpath/shared';
import { testConnection } from '../../db/index.js';
import { config } from '../../config.js';
import { getBackupInfo } from '../../lib/settings-storage.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Load package.json to get version
// Use dynamic path resolution to work in both source and compiled contexts
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadPackageJson(): { version: string } {
  // Try paths from current module location up to api/package.json
  // Source: src/trpc/routers/ -> 3 levels up
  // Compiled: dist/src/trpc/routers/ -> 4 levels up
  const possiblePaths = [
    join(__dirname, '..', '..', '..', 'package.json'), // From source
    join(__dirname, '..', '..', '..', '..', 'package.json'), // From dist
  ];

  for (const pkgPath of possiblePaths) {
    try {
      const content = readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content) as { version?: string; name?: string };
      if (pkg.name === '@openpath/api' && pkg.version) {
        return { version: pkg.version };
      }
    } catch {
      continue;
    }
  }

  logger.warn('Could not find package.json, using fallback version');
  return { version: '0.0.0' };
}

const packageJson = loadPackageJson();

/**
 * Parse JWT expiry string (e.g., "15m", "8h", "7d") to human-readable format
 */
function parseExpiryToHuman(expiry: string): string {
  const regex = /^(\d+)([smhd])$/;
  const match = regex.exec(expiry);
  if (!match?.[1] || !match[2]) return expiry;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const unitNames: Record<string, string> = {
    s: value === 1 ? 'segundo' : 'segundos',
    m: value === 1 ? 'minuto' : 'minutos',
    h: value === 1 ? 'hora' : 'horas',
    d: value === 1 ? 'día' : 'días',
  };

  return `${String(value)} ${unitNames[unit] ?? unit}`;
}

export const healthcheckRouter = router({
  live: publicProcedure.query(() => {
    return { status: 'alive', timestamp: new Date().toISOString() };
  }),

  ready: publicProcedure.query(async () => {
    const startTime = Date.now();
    const checks: Record<string, { status: string; totalRequests?: number; error?: string }> = {};
    let status = 'ok';

    // Storage check
    try {
      const stats = await getStats();
      checks.storage = { status: 'ok', totalRequests: stats.total };
    } catch (e: unknown) {
      const message = getErrorMessage(e);
      logger.error('Healthcheck readiness check failed', { error: message });
      checks.storage = { status: 'error', error: message };
      status = 'degraded';
    }

    // Config checks
    const authConfigured =
      (process.env.ADMIN_TOKEN !== undefined && process.env.ADMIN_TOKEN !== '') ||
      (process.env.JWT_SECRET !== undefined && process.env.JWT_SECRET !== '');
    checks.auth = { status: authConfigured ? 'configured' : 'not_configured' };
    if (!authConfigured) status = 'degraded';

    return {
      status,
      service: 'openpath-api',
      uptime: process.uptime(),
      checks,
      responseTime: `${String(Date.now() - startTime)} ms`,
    };
  }),

  /**
   * System information endpoint for the Settings page.
   * Returns version, database status, session configuration, and backup info.
   */
  systemInfo: publicProcedure.query(async () => {
    // Check database connection
    let dbConnected = false;
    try {
      dbConnected = await testConnection();
    } catch {
      dbConnected = false;
    }

    // Get backup info
    const backupInfo = await getBackupInfo();

    // Calculate human-readable backup time
    let lastBackupHuman: string | null = null;
    if (backupInfo.lastBackupAt) {
      const backupDate = new Date(backupInfo.lastBackupAt);
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

    return {
      version: packageJson.version,
      database: {
        connected: dbConnected,
        type: 'PostgreSQL',
      },
      session: {
        accessTokenExpiry: config.jwtAccessExpiry,
        accessTokenExpiryHuman: parseExpiryToHuman(config.jwtAccessExpiry),
        refreshTokenExpiry: config.jwtRefreshExpiry,
        refreshTokenExpiryHuman: parseExpiryToHuman(config.jwtRefreshExpiry),
      },
      backup: {
        lastBackupAt: backupInfo.lastBackupAt,
        lastBackupHuman,
        lastBackupStatus: backupInfo.lastBackupStatus,
      },
      uptime: process.uptime(),
    };
  }),
});
