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
    priority: (row.priority ?? 'normal') as RequestPriority,
    status: (row.status ?? 'pending') as RequestStatus,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: row.resolvedBy ?? null,
    resolutionNote: row.resolutionNote ?? '',
  };
}

// =============================================================================
// Public API
// =============================================================================

export async function getAllRequests(
  status: RequestStatus | null = null
): Promise<DomainRequest[]> {
  const conditions = status !== null ? eq(requests.status, status) : undefined;

  const result = await db
    .select()
    .from(requests)
    .where(conditions)
    .orderBy(desc(requests.createdAt));

  return result.map(toStorageType);
}

export async function getRequestsByGroup(groupId: string): Promise<DomainRequest[]> {
  const result = await db
    .select()
    .from(requests)
    .where(eq(requests.groupId, groupId))
    .orderBy(desc(requests.createdAt));

  return result.map(toStorageType);
}

export async function getRequestById(id: string): Promise<DomainRequest | null> {
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

  const [result] = await db
    .insert(requests)
    .values({
      id,
      domain: normalize.domain(requestData.domain),
      reason: requestData.reason ?? '',
      requesterEmail: requestData.requesterEmail ?? 'anonymous',
      groupId: requestData.groupId ?? process.env.DEFAULT_GROUP ?? 'default',
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
