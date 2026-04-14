import * as auth from '../lib/auth.js';
import * as groupsStorage from '../lib/groups-storage.js';
import * as storage from '../lib/storage.js';

import type { DbExecutor } from '../db/index.js';
import type { JWTPayload } from '../lib/auth.js';

type DomainRequestStatus = 'pending' | 'approved' | 'rejected';

export interface RequestCreationInput {
  clientVersion?: string | undefined;
  domain: string;
  errorType?: string | undefined;
  groupId?: string | undefined;
  machineHostname?: string | undefined;
  originHost?: string | undefined;
  originPage?: string | undefined;
  reason?: string | undefined;
  requesterEmail?: string | undefined;
  source?: string | undefined;
}

export interface StoredDomainRequest {
  clientVersion: string | null;
  createdAt: string;
  domain: string;
  errorType: string | null;
  groupId: string;
  id: string;
  machineHostname: string | null;
  originHost: string | null;
  originPage: string | null;
  reason: string;
  requesterEmail: string;
  resolutionNote: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  source: string;
  status: DomainRequestStatus;
  updatedAt: string;
}

export interface ResolvedGroupTarget {
  id: string;
  name: string;
}

export interface UpdateRequestStatusOptions {
  executor?: DbExecutor;
  expectedStatus?: DomainRequestStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRequestStatus(value: unknown): value is DomainRequestStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected';
}

export function parseStoredRequest(value: unknown): StoredDomainRequest {
  if (!isRecord(value)) {
    throw new Error('Invalid request payload');
  }

  const {
    clientVersion,
    createdAt,
    domain,
    errorType,
    groupId,
    id,
    machineHostname,
    originHost,
    originPage,
    reason,
    requesterEmail,
    resolutionNote,
    resolvedAt,
    resolvedBy,
    source,
    status,
    updatedAt,
  } = value;

  if (
    typeof id !== 'string' ||
    typeof domain !== 'string' ||
    typeof groupId !== 'string' ||
    typeof reason !== 'string' ||
    typeof requesterEmail !== 'string' ||
    typeof source !== 'string' ||
    typeof createdAt !== 'string' ||
    typeof updatedAt !== 'string' ||
    typeof resolutionNote !== 'string' ||
    !isRequestStatus(status)
  ) {
    throw new Error('Invalid request payload');
  }

  return {
    clientVersion: typeof clientVersion === 'string' ? clientVersion : null,
    createdAt,
    domain,
    errorType: typeof errorType === 'string' ? errorType : null,
    groupId,
    id,
    machineHostname: typeof machineHostname === 'string' ? machineHostname : null,
    originHost: typeof originHost === 'string' ? originHost : null,
    originPage: typeof originPage === 'string' ? originPage : null,
    reason,
    requesterEmail,
    resolutionNote,
    resolvedAt: typeof resolvedAt === 'string' ? resolvedAt : null,
    resolvedBy: typeof resolvedBy === 'string' ? resolvedBy : null,
    source,
    status,
    updatedAt,
  };
}

export function parseOptionalStoredRequest(value: unknown): StoredDomainRequest | null {
  return value === null ? null : parseStoredRequest(value);
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function createStoredRequest(
  input: RequestCreationInput
): Promise<StoredDomainRequest> {
  return parseStoredRequest(await storage.createRequest(input));
}

export async function getStoredRequestById(id: string): Promise<StoredDomainRequest | null> {
  return parseOptionalStoredRequest(await storage.getRequestById(id));
}

export async function updateStoredRequestStatus(
  id: string,
  status: 'approved' | 'rejected',
  resolvedBy?: string,
  note?: string | null,
  options?: UpdateRequestStatusOptions
): Promise<StoredDomainRequest | null> {
  return parseOptionalStoredRequest(
    await storage.updateRequestStatus(id, status, resolvedBy, note, options)
  );
}

export async function resolveGroupTarget(rawGroup: string): Promise<ResolvedGroupTarget | null> {
  const directById = await groupsStorage.getGroupById(rawGroup);
  if (directById) {
    return { id: directById.id, name: directById.name };
  }

  const normalized = rawGroup.endsWith('.txt') ? rawGroup.slice(0, -4) : rawGroup;
  const directByName = await groupsStorage.getGroupByName(normalized);
  if (directByName) {
    return { id: directByName.id, name: directByName.name };
  }

  return null;
}

export function canApproveResolvedTarget(
  user: JWTPayload,
  rawGroup: string,
  resolvedTarget: ResolvedGroupTarget
): boolean {
  return (
    auth.canApproveGroup(user, rawGroup) ||
    auth.canApproveGroup(user, resolvedTarget.id) ||
    auth.canApproveGroup(user, resolvedTarget.name)
  );
}
