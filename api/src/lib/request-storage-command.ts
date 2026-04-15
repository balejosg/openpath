/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 */

import { v4 as uuidv4 } from 'uuid';
import { and, eq, sql } from 'drizzle-orm';
import { db, requests } from '../db/index.js';
import type { DbExecutor } from '../db/index.js';
import { getRowCount, getRows } from './utils.js';
import type { DomainRequest, RequestStatus } from '../types/index.js';
import type { CreateRequestData } from '../types/storage.js';
import {
  hasRequestMetadataColumns,
  normalizeRequestDomain,
  toStorageType,
} from './request-storage-shared.js';
import {
  legacyRowToStorageType,
  type LegacyRequestRow,
  resolveRequestGroupId,
} from './request-storage-legacy.js';

export async function createRequest(requestData: CreateRequestData): Promise<DomainRequest> {
  const id = `req_${uuidv4().slice(0, 8)}`;
  const groupId = await resolveRequestGroupId(requestData);

  if (!(await hasRequestMetadataColumns())) {
    const row = getRows<LegacyRequestRow>(
      await db.execute(sql`
        INSERT INTO requests (id, domain, reason, requester_email, group_id, status)
        VALUES (
          ${id},
          ${normalizeRequestDomain(requestData.domain)},
          ${requestData.reason ?? ''},
          ${requestData.requesterEmail ?? 'anonymous'},
          ${groupId},
          'pending'
        )
        RETURNING id, domain, reason, requester_email, group_id, status,
                  created_at, updated_at, resolved_at, resolved_by, resolution_note
      `)
    )[0];

    if (!row) {
      throw new Error(`Failed to create request for domain "${requestData.domain}"`);
    }

    return legacyRowToStorageType(row);
  }

  const [result] = await db
    .insert(requests)
    .values({
      id,
      domain: normalizeRequestDomain(requestData.domain),
      reason: requestData.reason ?? '',
      requesterEmail: requestData.requesterEmail ?? 'anonymous',
      groupId,
      source: requestData.source ?? 'unknown',
      machineHostname: requestData.machineHostname ?? null,
      originHost: requestData.originHost ?? null,
      originPage: requestData.originPage ?? null,
      clientVersion: requestData.clientVersion ?? null,
      errorType: requestData.errorType ?? null,
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
  note: string | null = null,
  options?: {
    executor?: DbExecutor;
    expectedStatus?: RequestStatus;
  }
): Promise<DomainRequest | null> {
  const executor = options?.executor ?? db;
  const updateValues: Partial<typeof requests.$inferInsert> = {
    status,
    resolvedBy,
    resolvedAt: new Date(),
  };

  if (note !== null) {
    updateValues.resolutionNote = note;
  }

  const conditions = [eq(requests.id, id)];
  if (options?.expectedStatus !== undefined) {
    conditions.push(eq(requests.status, options.expectedStatus));
  }

  const [result] = await executor
    .update(requests)
    .set(updateValues)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .returning();

  return result ? toStorageType(result) : null;
}

export async function deleteRequest(id: string): Promise<boolean> {
  return getRowCount(await db.delete(requests).where(eq(requests.id, id))) > 0;
}
