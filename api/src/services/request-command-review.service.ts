import * as auth from '../lib/auth.js';
import * as groupsStorage from '../lib/groups-storage.js';
import { withTransaction } from '../db/index.js';

import DomainEventsService from './domain-events.service.js';
import type { RequestResult } from './request-service-shared.js';
import {
  canApproveResolvedTarget,
  getStoredRequestById,
  resolveGroupTarget,
  toErrorMessage,
  updateStoredRequestStatus,
  type StoredDomainRequest,
} from './request-command-shared.js';
import type { JWTPayload } from '../lib/auth.js';

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
    const approval = await DomainEventsService.withDbTransactionEvents<{
      createdRule: boolean;
      updated: StoredDomainRequest | null;
    }>(withTransaction, async (tx, events) => {
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
