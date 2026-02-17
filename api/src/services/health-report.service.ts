/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * HealthReportService - Business logic for health report submission
 *
 * This service extracts the shared logic from REST endpoints and tRPC routers
 * to eliminate duplication and provide a single source of truth.
 */

import * as healthReports from '../lib/health-reports.js';
import { normalizeHealthActions, normalizeHealthStatus } from '../lib/health-status.js';

// =============================================================================
// Types
// =============================================================================

export interface SubmitHealthReportInput {
  hostname: string;
  status?: string | undefined;
  dnsmasqRunning?: boolean | undefined;
  dnsResolving?: boolean | undefined;
  failCount?: number | undefined;
  actions?: string | undefined;
  version?: string | undefined;
}

export interface SubmitHealthReportResult {
  success: true;
  message: string;
}

export interface HealthReportServiceError {
  code: 'HOSTNAME_REQUIRED';
  message: string;
}

export type HealthReportResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: HealthReportServiceError };

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Submit a health report from a client machine
 */
export async function submitHealthReport(
  input: SubmitHealthReportInput
): Promise<HealthReportResult<SubmitHealthReportResult>> {
  // Validate hostname
  if (!input.hostname || input.hostname.trim() === '') {
    return {
      ok: false,
      error: { code: 'HOSTNAME_REQUIRED', message: 'Hostname required' },
    };
  }

  // Save the health report with normalized values
  const normalized = normalizeHealthStatus(input.status ?? 'unknown');
  const normalizedActions = normalizeHealthActions(input.actions, normalized);

  await healthReports.saveHealthReport(input.hostname, {
    status: normalized.status,
    dnsmasqRunning: input.dnsmasqRunning ?? null,
    dnsResolving: input.dnsResolving ?? null,
    failCount: input.failCount ?? 0,
    actions: normalizedActions,
    version: input.version ?? 'unknown',
  });

  return {
    ok: true,
    data: {
      success: true,
      message: 'Health report received',
    },
  };
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  submitHealthReport,
};
