import { z } from 'zod';
import { router, adminProcedure, sharedSecretProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import * as healthReports from '../../lib/health-reports.js';
import { HealthReport } from '../../lib/health-reports.js';
import { stripUndefined } from '../../lib/utils.js';

export const healthReportsRouter = router({
  submit: sharedSecretProcedure
    .input(
      z
        .object({
          hostname: z.string().min(1),
          status: z.string().min(1),
          dnsmasqRunning: z.boolean().optional(),
          dnsResolving: z.boolean().optional(),
          failCount: z.number().optional(),
          actions: z.string().optional(),
          version: z.string().optional(),
        })
        .strict()
    )
    .mutation(async ({ input }) => {
      await healthReports.saveHealthReport(
        input.hostname,
        stripUndefined({
          status: input.status,
          dnsmasqRunning: input.dnsmasqRunning ?? null,
          dnsResolving: input.dnsResolving ?? null,
          failCount: input.failCount ?? 0,
          actions: input.actions ?? '',
          version: input.version ?? 'unknown',
        }) as Omit<HealthReport, 'timestamp'>
      );

      return { success: true, message: 'Health report received' };
    }),

  list: adminProcedure.query(async () => {
    const data = await healthReports.getAllReports();
    const summary: {
      totalHosts: number;
      lastUpdated: string | null;
      byStatus: Record<string, number>;
      hosts: {
        hostname: string;
        status: string | null;
        lastSeen: string | null;
        version?: string;
        recentFailCount: number;
      }[];
    } = {
      totalHosts: Object.keys(data.hosts).length,
      lastUpdated: data.lastUpdated,
      byStatus: {},
      hosts: [],
    };

    for (const [hostname, host] of Object.entries(data.hosts)) {
      const status = host.currentStatus ?? 'UNKNOWN';
      summary.byStatus[status] = (summary.byStatus[status] ?? 0) + 1;

      const lastReport = host.reports[host.reports.length - 1];

      summary.hosts.push({
        hostname,
        status: host.currentStatus,
        lastSeen: host.lastSeen,
        ...(host.version !== undefined && { version: host.version }),
        recentFailCount: lastReport?.failCount ?? 0,
      });
    }
    return summary;
  }),

  getAlerts: adminProcedure
    .input(z.object({ staleThreshold: z.number().default(10) }))
    .query(async ({ input }) => {
      const data = await healthReports.getAllReports();
      const problemStatuses = [
        'FAIL_OPEN',
        'CRITICAL',
        'WARNING',
        'DEGRADED',
        'STALE_FAILSAFE',
        'TAMPERED',
      ];
      const now = new Date();
      const alerts: {
        hostname: string;
        type: string;
        status: string;
        lastSeen: string | null;
        message: string;
      }[] = [];

      for (const [hostname, host] of Object.entries(data.hosts)) {
        const lastSeen = new Date(host.lastSeen ?? 0);
        const minutesSinceLastSeen = (now.getTime() - lastSeen.getTime()) / 1000 / 60;

        if (
          host.currentStatus !== null &&
          host.currentStatus !== '' &&
          problemStatuses.includes(host.currentStatus)
        ) {
          alerts.push({
            hostname,
            type: 'status',
            status: host.currentStatus,
            lastSeen: host.lastSeen,
            message: `Host reporting ${host.currentStatus} status`,
          });
        }

        if (minutesSinceLastSeen > input.staleThreshold) {
          alerts.push({
            hostname,
            type: 'stale',
            status: 'STALE',
            lastSeen: host.lastSeen,
            message: `Host hasn't reported in ${String(Math.round(minutesSinceLastSeen))} minutes`,
          });
        }
      }
      return { alertCount: alerts.length, alerts };
    }),

  getByHost: adminProcedure.input(z.object({ hostname: z.string() })).query(async ({ input }) => {
    const host = await healthReports.getHostReports(input.hostname);
    if (!host) throw new TRPCError({ code: 'NOT_FOUND', message: 'Host not found' });

    return {
      hostname: input.hostname,
      currentStatus: host.currentStatus,
      lastSeen: host.lastSeen,
      version: host.version,
      reportCount: host.reports.length,
      reports: host.reports.slice(-20),
    };
  }),
});
