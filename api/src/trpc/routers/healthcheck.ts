import { router, publicProcedure } from '../trpc.js';
import { getStats } from '../../lib/user-storage.js';
import { logger } from '../../lib/logger.js';
import { getErrorMessage } from '@openpath/shared';
import { testConnection } from '../../db/index.js';
import { config } from '../../config.js';
import { createRequire } from 'node:module';

// Load package.json to get version
const require = createRequire(import.meta.url);
const packageJson = require('../../../package.json') as { version: string };

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
   * Returns version, database status, and session configuration.
   */
  systemInfo: publicProcedure.query(async () => {
    // Check database connection
    let dbConnected = false;
    try {
      dbConnected = await testConnection();
    } catch {
      dbConnected = false;
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
      uptime: process.uptime(),
    };
  }),
});
