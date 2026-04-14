import { router, publicProcedure } from '../trpc.js';
import HealthcheckService from '../../services/healthcheck.service.js';
import { TRPCError } from '@trpc/server';

export const healthcheckRouter = router({
  live: publicProcedure.query(() => {
    return { status: 'alive', timestamp: new Date().toISOString() };
  }),

  ready: publicProcedure.query(async () => {
    return await HealthcheckService.getReadinessStatus();
  }),

  /**
   * Operational system details are intentionally out of the product surface.
   */
  systemInfo: publicProcedure.query(() => {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'System information is not available in this release',
    });
  }),
});
