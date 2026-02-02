import { router, publicProcedure } from '../trpc.js';
import { getStats } from '../../lib/user-storage.js';
import { logger } from '../../lib/logger.js';
import { getErrorMessage } from '@openpath/shared';

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
});
