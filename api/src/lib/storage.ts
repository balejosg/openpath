/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Simple PostgreSQL storage for domain requests using Drizzle ORM
 */

import { v4 as uuidv4 } from 'uuid';
import { eq, desc, and, sql, count } from 'drizzle-orm';
import { normalize } from '@openpath/shared';
import { db, requests } from '../db/index.js';
import type { DomainRequest, RequestStatus, RequestPriority } from '../types/index.js';
import type { IRequestStorage, CreateRequestData, RequestStats } from '../types/storage.js';

// =============================================================================
// Type Conversion Helper
// =============================================================================

function toStorageType(row: typeof requests.$inferSelect): DomainRequest {
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
    priority: (row.priority ?? 'normal') as RequestPriority,
    status: (row.status ?? 'pending') as RequestStatus,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: row.resolvedBy ?? null,
    resolutionNote: row.resolutionNote ?? '',
  };
}

interface LegacyRequestRow {
  id: string;
  domain: string;
  reason: string | null;
  requester_email: string | null;
  group_id: string;
  priority: string | null;
  status: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  resolved_at: Date | string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

function legacyRowToStorageType(row: LegacyRequestRow): DomainRequest {
  const toIso = (value: Date | string | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  return {
    id: row.id,
    domain: row.domain,
    reason: row.reason ?? '',
    requesterEmail: row.requester_email ?? '',
    groupId: row.group_id,
    source: 'unknown',
    machineHostname: null,
    originHost: null,
    originPage: null,
    clientVersion: null,
    errorType: null,
    priority: (row.priority ?? 'normal') as RequestPriority,
    status: (row.status ?? 'pending') as RequestStatus,
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
    resolvedAt: toIso(row.resolved_at),
    resolvedBy: row.resolved_by ?? null,
    resolutionNote: row.resolution_note ?? '',
  };
}

let metadataColumnCheck: boolean | null = null;

async function hasRequestMetadataColumns(): Promise<boolean> {
  if (metadataColumnCheck !== null) return metadataColumnCheck;

  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'requests'
        AND column_name = 'source'
    ) AS has_source
  `);

  const row = result.rows[0] as { has_source?: boolean | number | string } | undefined;
  const raw = row?.has_source;
  metadataColumnCheck = raw === true || raw === 't' || raw === 1 || raw === '1';
  return metadataColumnCheck;
}

// =============================================================================
// Public API
// =============================================================================

export async function getAllRequests(
  status: RequestStatus | null = null
): Promise<DomainRequest[]> {
  if (!(await hasRequestMetadataColumns())) {
    const rows = await db.execute(sql`
      SELECT id, domain, reason, requester_email, group_id, priority, status,
             created_at, updated_at, resolved_at, resolved_by, resolution_note
      FROM requests
      ${status !== null ? sql`WHERE status = ${status}` : sql``}
      ORDER BY created_at DESC
    `);
    return rows.rows.map((r) => legacyRowToStorageType(r as unknown as LegacyRequestRow));
  }

  const conditions = status !== null ? eq(requests.status, status) : undefined;

  const result = await db
    .select()
    .from(requests)
    .where(conditions)
    .orderBy(desc(requests.createdAt));

  return result.map(toStorageType);
}

export async function getRequestsByGroup(groupId: string): Promise<DomainRequest[]> {
  if (!(await hasRequestMetadataColumns())) {
    const rows = await db.execute(sql`
      SELECT id, domain, reason, requester_email, group_id, priority, status,
             created_at, updated_at, resolved_at, resolved_by, resolution_note
      FROM requests
      WHERE group_id = ${groupId}
      ORDER BY created_at DESC
    `);
    return rows.rows.map((r) => legacyRowToStorageType(r as unknown as LegacyRequestRow));
  }

  const result = await db
    .select()
    .from(requests)
    .where(eq(requests.groupId, groupId))
    .orderBy(desc(requests.createdAt));

  return result.map(toStorageType);
}

export async function getRequestById(id: string): Promise<DomainRequest | null> {
  if (!(await hasRequestMetadataColumns())) {
    const rows = await db.execute(sql`
      SELECT id, domain, reason, requester_email, group_id, priority, status,
             created_at, updated_at, resolved_at, resolved_by, resolution_note
      FROM requests
      WHERE id = ${id}
      LIMIT 1
    `);
    return rows.rows[0]
      ? legacyRowToStorageType(rows.rows[0] as unknown as LegacyRequestRow)
      : null;
  }

  const result = await db.select().from(requests).where(eq(requests.id, id)).limit(1);

  return result[0] ? toStorageType(result[0]) : null;
}

export async function hasPendingRequest(domain: string): Promise<boolean> {
  const result = await db
    .select({ id: requests.id })
    .from(requests)
    .where(and(sql`LOWER(${requests.domain}) = LOWER(${domain})`, eq(requests.status, 'pending')))
    .limit(1);

  return result.length > 0;
}

export async function createRequest(requestData: CreateRequestData): Promise<DomainRequest> {
  const priority: RequestPriority = requestData.priority ?? 'normal';
  const id = `req_${uuidv4().slice(0, 8)}`;

  if (!(await hasRequestMetadataColumns())) {
    const result = await db.execute(sql`
      INSERT INTO requests (id, domain, reason, requester_email, group_id, priority, status)
      VALUES (
        ${id},
        ${normalize.domain(requestData.domain)},
        ${requestData.reason ?? ''},
        ${requestData.requesterEmail ?? 'anonymous'},
        ${requestData.groupId ?? process.env.DEFAULT_GROUP ?? 'default'},
        ${priority},
        'pending'
      )
      RETURNING id, domain, reason, requester_email, group_id, priority, status,
                created_at, updated_at, resolved_at, resolved_by, resolution_note
    `);

    const row = result.rows[0] as LegacyRequestRow | undefined;
    if (!row) {
      throw new Error(`Failed to create request for domain "${requestData.domain}"`);
    }
    return legacyRowToStorageType(row);
  }

  const [result] = await db
    .insert(requests)
    .values({
      id,
      domain: normalize.domain(requestData.domain),
      reason: requestData.reason ?? '',
      requesterEmail: requestData.requesterEmail ?? 'anonymous',
      groupId: requestData.groupId ?? process.env.DEFAULT_GROUP ?? 'default',
      source: requestData.source ?? 'unknown',
      machineHostname: requestData.machineHostname ?? null,
      originHost: requestData.originHost ?? null,
      originPage: requestData.originPage ?? null,
      clientVersion: requestData.clientVersion ?? null,
      errorType: requestData.errorType ?? null,
      priority,
      status: 'pending',
    })
    .returning();

  if (!result) {
    throw new Error(`Failed to create request for domain "${requestData.domain}"`);
  }
  return toStorageType(result);
}

export async function updateRequestStatus(
  id: string,
  status: 'approved' | 'rejected',
  resolvedBy = 'admin',
  note: string | null = null
): Promise<DomainRequest | null> {
  const updateValues: Partial<typeof requests.$inferInsert> = {
    status,
    resolvedBy,
    resolvedAt: new Date(),
  };

  if (note !== null) {
    updateValues.resolutionNote = note;
  }

  const [result] = await db
    .update(requests)
    .set(updateValues)
    .where(eq(requests.id, id))
    .returning();

  return result ? toStorageType(result) : null;
}

export async function deleteRequest(id: string): Promise<boolean> {
  const result = await db.delete(requests).where(eq(requests.id, id));

  return (result.rowCount ?? 0) > 0;
}

export async function getStats(): Promise<RequestStats> {
  const result = await db
    .select({
      status: requests.status,
      count: count(),
    })
    .from(requests)
    .groupBy(requests.status);

  const stats: RequestStats = {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  result.forEach((row) => {
    const cnt = row.count;
    stats.total += cnt;
    if (row.status === 'pending') stats.pending = cnt;
    if (row.status === 'approved') stats.approved = cnt;
    if (row.status === 'rejected') stats.rejected = cnt;
  });

  return stats;
}

// =============================================================================
// Storage Instance (implements interface)
// =============================================================================

export const storage: IRequestStorage = {
  getAllRequests,
  getRequestById,
  getRequestsByGroup,
  hasPendingRequest,
  createRequest,
  updateRequestStatus,
  deleteRequest,
  getStats,
};

export default storage;
