import * as storage from '../lib/storage.js';
import * as groupsStorage from '../lib/groups-storage.js';
import * as push from '../lib/push.js';
import * as auth from '../lib/auth.js';
import { withTransaction } from '../db/index.js';
import { logger } from '../lib/logger.js';
import type { DbExecutor } from '../db/index.js';
import type { JWTPayload } from '../lib/auth.js';
import DomainEventsService from './domain-events.service.js';
import type { RequestResult } from './request-service-shared.js';

interface RequestCreationInput {
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

type DomainRequestStatus = 'pending' | 'approved' | 'rejected';

interface StoredDomainRequest {
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

interface ResolvedGroupTarget {
  id: string;
  name: string;
}

interface UpdateRequestStatusOptions {
  executor?: DbExecutor;
  expectedStatus?: DomainRequestStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRequestStatus(value: unknown): value is DomainRequestStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected';
}

function parseStoredRequest(value: unknown): StoredDomainRequest {
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

function parseOptionalStoredRequest(value: unknown): StoredDomainRequest | null {
  return value === null ? null : parseStoredRequest(value);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function createStoredRequest(input: RequestCreationInput): Promise<StoredDomainRequest> {
  return parseStoredRequest(await storage.createRequest(input));
}

async function getStoredRequestById(id: string): Promise<StoredDomainRequest | null> {
  return parseOptionalStoredRequest(await storage.getRequestById(id));
}

async function updateStoredRequestStatus(
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

async function resolveGroupTarget(rawGroup: string): Promise<ResolvedGroupTarget | null> {
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

function canApproveResolvedTarget(
  user: JWTPayload,
  rawGroup: string,
  resolvedTarget: ResolvedGroupTarget
): boolean {
  if (auth.canApproveGroup(user, rawGroup)) {
    return true;
  }
  if (auth.canApproveGroup(user, resolvedTarget.id)) {
    return true;
  }
  if (auth.canApproveGroup(user, resolvedTarget.name)) {
    return true;
  }
  return false;
}

export async function createRequest(
  input: RequestCreationInput
): Promise<RequestResult<StoredDomainRequest>> {
  if (await storage.hasPendingRequest(input.domain)) {
    return {
      ok: false,
      error: { code: 'CONFLICT', message: 'Pending request exists for this domain' },
    };
  }

  try {
    const request = await createStoredRequest(input);

    push.notifyTeachersOfNewRequest(request).catch((error: unknown) => {
      logger.error('Failed to notify teachers of new request', {
        requestId: request.id,
        domain: request.domain,
        error: toErrorMessage(error),
      });
    });

    return { ok: true, data: request };
  } catch (error) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: toErrorMessage(error) },
    };
  }
}

export async function approveRequest(
  id: string,
  groupId: string | undefined,
  user: JWTPayload
): Promise<RequestResult<StoredDomainRequest>> {
  const request = await getStoredRequestById(id);
  if (!request) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Request not found' } };
  }

  if (request.status !== 'pending') {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: `Request is already ${request.status}` },
    };
  }

  const rawTargetGroup = groupId ?? request.groupId;
  const hasRawPermission = auth.canApproveGroup(user, rawTargetGroup);
  const resolvedTarget = await resolveGroupTarget(rawTargetGroup);

  if (
    !hasRawPermission &&
    (!resolvedTarget || !canApproveResolvedTarget(user, rawTargetGroup, resolvedTarget))
  ) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to approve for this group' },
    };
  }

  if (!resolvedTarget) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'Target group does not exist' },
    };
  }

  if (!auth.isAdminToken(user)) {
    const blocked = await groupsStorage.isDomainBlocked(resolvedTarget.id, request.domain);
    if (blocked.blocked) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'This domain is explicitly blocked' },
      };
    }
  }

  try {
    const approval = await DomainEventsService.withQueuedEvents(async (events) => {
      return withTransaction(async (tx) => {
        const ruleResult = await groupsStorage.createRule(
          resolvedTarget.id,
          'whitelist',
          request.domain,
          null,
          'manual',
          tx
        );

        if (!ruleResult.success && ruleResult.error !== 'Rule already exists') {
          throw new Error(ruleResult.error ?? 'Failed to add domain to whitelist');
        }

        const updated = await updateStoredRequestStatus(
          request.id,
          'approved',
          user.name,
          `Added to ${resolvedTarget.name}`,
          {
            executor: tx,
            expectedStatus: 'pending',
          }
        );

        if (ruleResult.success) {
          events.publishWhitelistChanged(resolvedTarget.id);
        }

        return {
          updated,
          createdRule: ruleResult.success,
        };
      });
    });

    if (!approval.updated) {
      return {
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Request is no longer pending' },
      };
    }

    return { ok: true, data: approval.updated };
  } catch (error) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: toErrorMessage(error) },
    };
  }
}

export async function rejectRequest(
  id: string,
  reason: string | undefined,
  user: JWTPayload
): Promise<RequestResult<StoredDomainRequest>> {
  const request = await getStoredRequestById(id);
  if (!request) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Request not found' } };
  }

  if (request.status !== 'pending') {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: `Request is already ${request.status}` },
    };
  }

  if (!auth.canApproveGroup(user, request.groupId)) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to manage this request' },
    };
  }

  const updated = await updateStoredRequestStatus(request.id, 'rejected', user.name, reason);
  if (!updated) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Failed to update request status' } };
  }

  return { ok: true, data: updated };
}

export async function deleteRequest(id: string): Promise<RequestResult<{ success: boolean }>> {
  const deleted = await storage.deleteRequest(id);
  if (!deleted) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Request not found' } };
  }
  return { ok: true, data: { success: true } };
}

export const RequestCommandService = {
  createRequest,
  approveRequest,
  rejectRequest,
  deleteRequest,
};

export default RequestCommandService;
