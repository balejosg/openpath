/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 */

import { sql } from 'drizzle-orm';
import { normalize } from '@openpath/shared';
import { db, requests } from '../db/index.js';
import type { DomainRequest, RequestStatus } from '../types/index.js';
import { getRows } from './utils.js';

export function toStorageType(row: typeof requests.$inferSelect): DomainRequest {
  return {
    id: row.id,
    domain: row.domain,
    reason: row.reason ?? '',
    requesterEmail: row.requesterEmail ?? '',
    groupId: row.groupId,
    source: row.source ?? 'unknown',
    machineHostname: row.machineHostname ?? null,
    originHost: row.originHost ?? null,
    originPage: row.originPage ?? null,
    clientVersion: row.clientVersion ?? null,
    errorType: row.errorType ?? null,
    status: (row.status ?? 'pending') as RequestStatus,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: row.resolvedBy ?? null,
    resolutionNote: row.resolutionNote ?? '',
  };
}

let metadataColumnCheck: boolean | null = null;

export async function hasRequestMetadataColumns(): Promise<boolean> {
  if (metadataColumnCheck !== null) {
    return metadataColumnCheck;
  }

  const row = getRows<{ has_source?: boolean | number | string }>(
    await db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'requests'
          AND column_name = 'source'
      ) AS has_source
    `)
  )[0];
  const raw = row?.has_source;
  metadataColumnCheck = raw === true || raw === 't' || raw === 1 || raw === '1';
  return metadataColumnCheck;
}

export function normalizeRequestDomain(domain: string): string {
  return normalize.domain(domain);
}
