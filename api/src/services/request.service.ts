/**
 * RequestService - Business logic for domain request handling
 */

import * as storage from '../lib/storage.js';
import * as groupsStorage from '../lib/groups-storage.js';
import * as push from '../lib/push.js';
import * as auth from '../lib/auth.js';
import { logger } from '../lib/logger.js';
import type { JWTPayload } from '../lib/auth.js';
import type { CreateRequestData } from '../types/storage.js';
import type { DomainRequest, RequestStatus } from '../types/index.js';
import { getErrorMessage } from '@openpath/shared';

// =============================================================================
// Types
// =============================================================================

export type RequestServiceError =
  | { code: 'CONFLICT'; message: string }
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'FORBIDDEN'; message: string }
  | { code: 'BAD_REQUEST'; message: string };

export type RequestResult<T> = { ok: true; data: T } | { ok: false; error: RequestServiceError };

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Create a new domain access request
 */
export async function createRequest(
  input: CreateRequestData
): Promise<RequestResult<DomainRequest>> {
  if (await storage.hasPendingRequest(input.domain)) {
    return {
      ok: false,
      error: { code: 'CONFLICT', message: 'Pending request exists for this domain' },
    };
  }

  try {
    const request = await storage.createRequest(input);

    // Notify teachers asynchronously (non-blocking)
    push.notifyTeachersOfNewRequest(request).catch((error: unknown) => {
      logger.error('Failed to notify teachers of new request', {
        requestId: request.id,
        domain: request.domain,
        error: getErrorMessage(error),
      });
    });

    return { ok: true, data: request };
  } catch (error) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: getErrorMessage(error) },
    };
  }
}

/**
 * Approve a request
 */
export async function approveRequest(
  id: string,
  groupId: string | undefined,
  user: JWTPayload
): Promise<RequestResult<DomainRequest>> {
  const request = await storage.getRequestById(id);
  if (!request) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Request not found' } };
  }

  if (request.status !== 'pending') {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: `Request is already ${request.status}` },
    };
  }

  const targetGroup = groupId ?? request.groupId;
  if (!auth.canApproveGroup(user, targetGroup)) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to approve for this group' },
    };
  }

  // Check blocked domains for non-admins
  if (!auth.isAdminToken(user)) {
    const blocked = await groupsStorage.isDomainBlocked(targetGroup, request.domain);
    if (blocked.blocked) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'This domain is explicitly blocked' },
      };
    }
  }

  try {
    const ruleResult = await groupsStorage.createRule(targetGroup, 'whitelist', request.domain);
    if (!ruleResult.success) {
      if (ruleResult.error === 'Rule already exists') {
        // Domain already whitelisted - still mark request as approved
      } else {
        throw new Error(ruleResult.error ?? 'Failed to add domain to whitelist');
      }
    }
    const updated = await storage.updateRequestStatus(
      request.id,
      'approved',
      user.name,
      `Added to ${targetGroup}`
    );

    if (!updated) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Failed to update request status' },
      };
    }

    return { ok: true, data: updated };
  } catch (error) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: getErrorMessage(error) },
    };
  }
}

/**
 * Reject a request
 */
export async function rejectRequest(
  id: string,
  reason: string | undefined,
  user: JWTPayload
): Promise<RequestResult<DomainRequest>> {
  const request = await storage.getRequestById(id);
  if (!request) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Request not found' } };
  }

  if (request.status !== 'pending') {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: `Request is already ${request.status}` },
    };
  }

  // Security check: teacher must have access to the group
  if (!auth.canApproveGroup(user, request.groupId)) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to manage this request' },
    };
  }

  const updated = await storage.updateRequestStatus(request.id, 'rejected', user.name, reason);

  if (!updated) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Failed to update request status' } };
  }

  return { ok: true, data: updated };
}

/**
 * List requests with role-based filtering
 */
export async function listRequests(
  status: RequestStatus | null,
  user: JWTPayload
): Promise<DomainRequest[]> {
  let requests = await storage.getAllRequests(status);

  const groups = auth.getApprovalGroups(user);
  if (groups !== 'all') {
    requests = requests.filter((r) => groups.includes(r.groupId));
  }

  return requests;
}

/**
 * Get a specific request with access control
 */
export async function getRequest(
  id: string,
  user: JWTPayload
): Promise<RequestResult<DomainRequest>> {
  const request = await storage.getRequestById(id);
  if (!request) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Request not found' } };
  }

  const groups = auth.getApprovalGroups(user);
  if (groups !== 'all' && !groups.includes(request.groupId)) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You do not have access to this request' },
    };
  }

  return { ok: true, data: request };
}

/**
 * Delete a request
 */
export async function deleteRequest(id: string): Promise<RequestResult<{ success: boolean }>> {
  const deleted = await storage.deleteRequest(id);
  if (!deleted) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Request not found' } };
  }
  return { ok: true, data: { success: true } };
}

/**
 * Get approval groups for user
 */
export function getApprovalGroupsForUser(user: JWTPayload): string[] | 'all' {
  return auth.getApprovalGroups(user);
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  createRequest,
  approveRequest,
  rejectRequest,
  listRequests,
  getRequest,
  deleteRequest,
  getApprovalGroupsForUser,
};
