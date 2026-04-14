import { config } from '../config.js';
import { withTransaction } from '../db/index.js';
import * as classroomStorage from '../lib/classroom-storage.js';
import * as groupsStorage from '../lib/groups-storage.js';
import { logger } from '../lib/logger.js';
import { normalizeHostInput } from '../lib/machine-proof.js';
import { parseWhitelistDomain } from '../lib/public-request-input.js';
import { resolveMachineTokenHostnameAccess } from '../lib/server-request-auth.js';
import type { CreateRuleResult } from '../lib/groups-storage.js';
import DomainEventsService from './domain-events.service.js';
import { createRequest, type RequestResult, type RequestServiceError } from './request.service.js';

export type PublicRequestServiceError = RequestServiceError;
export type PublicRequestResult<T> = RequestResult<T>;

interface MachineRequestContext {
  domain: string;
  groupId: string;
  machineHostname: string;
}

interface ResolveMachineRequestContextInput {
  domainRaw: string;
  hostnameRaw: string;
  logContext: string;
  token: string;
}

interface CreateMachineRequestInput {
  clientVersion?: string | undefined;
  domainRaw: string;
  errorType?: string | undefined;
  hostnameRaw: string;
  logContext: string;
  originHost?: string | undefined;
  originPage?: string | undefined;
  reason?: string | undefined;
  source: 'auto_extension' | 'firefox-extension';
  token: string;
}

export interface PendingMachineRequestOutcome {
  autoApproved: false;
  domain: string;
  groupId: string;
  requestId: string;
  requestStatus: string;
  source: 'auto_extension' | 'firefox-extension';
}

export interface ApprovedMachineRequestOutcome {
  autoApproved: true;
  domain: string;
  duplicate: boolean;
  groupId: string;
  source: 'auto_extension';
  status: 'approved' | 'duplicate';
}

export type AutoMachineRequestOutcome =
  | PendingMachineRequestOutcome
  | ApprovedMachineRequestOutcome;

async function resolveMachineRequestContext(
  input: ResolveMachineRequestContextInput
): Promise<PublicRequestResult<MachineRequestContext>> {
  const hostname = normalizeHostInput(input.hostnameRaw);
  const access = await resolveMachineTokenHostnameAccess({
    machineToken: input.token,
    hostname,
  });

  if (!access.ok && access.error === 'invalid-token') {
    logger.warn(`${input.logContext} rejected: invalid machine token`, { hostname });
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Invalid machine token' },
    };
  }

  if (!access.ok) {
    logger.warn(`${input.logContext} rejected: hostname mismatch`, {
      requestedHostname: access.requestedHostname,
      machineHostname: access.machine?.hostname.trim().toLowerCase(),
      reportedHostname: access.machine?.reportedHostname?.trim().toLowerCase(),
    });
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Token is not valid for this hostname' },
    };
  }

  const domainParse = parseWhitelistDomain(input.domainRaw);
  if (!domainParse.ok) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: domainParse.error },
    };
  }

  const policyContext = await classroomStorage.resolveEffectiveMachinePolicyContext(
    access.machine.hostname
  );
  if (!policyContext) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'No active group found for machine hostname' },
    };
  }

  if (policyContext.mode === 'unrestricted' || !policyContext.groupId) {
    return {
      ok: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Machine classroom is unrestricted and does not require access requests',
      },
    };
  }

  return {
    ok: true,
    data: {
      domain: domainParse.domain,
      groupId: policyContext.groupId,
      machineHostname: access.machine.hostname,
    },
  };
}

async function createMachineRequest(
  input: CreateMachineRequestInput
): Promise<PublicRequestResult<PendingMachineRequestOutcome>> {
  const context = await resolveMachineRequestContext(input);
  if (!context.ok) {
    return context;
  }

  const created = await createRequest({
    domain: context.data.domain,
    reason:
      input.reason ??
      (input.source === 'auto_extension'
        ? 'Submitted via Firefox extension auto request'
        : 'Submitted via Firefox extension'),
    groupId: context.data.groupId,
    source: input.source,
    machineHostname: context.data.machineHostname,
    ...(input.originHost ? { originHost: input.originHost } : {}),
    ...(input.originPage ? { originPage: input.originPage } : {}),
    ...(input.clientVersion ? { clientVersion: input.clientVersion } : {}),
    ...(input.errorType ? { errorType: input.errorType } : {}),
  });

  if (!created.ok) {
    return created;
  }

  return {
    ok: true,
    data: {
      autoApproved: false,
      domain: context.data.domain,
      groupId: context.data.groupId,
      requestId: created.data.id,
      requestStatus: created.data.status,
      source: input.source,
    },
  };
}

export async function submitMachineRequest(
  input: Omit<CreateMachineRequestInput, 'logContext' | 'source'>
): Promise<PublicRequestResult<PendingMachineRequestOutcome>> {
  return createMachineRequest({
    ...input,
    logContext: 'Request submit',
    source: 'firefox-extension',
  });
}

export async function handleAutoMachineRequest(
  input: Pick<
    CreateMachineRequestInput,
    'domainRaw' | 'hostnameRaw' | 'originPage' | 'reason' | 'token'
  >
): Promise<PublicRequestResult<AutoMachineRequestOutcome>> {
  if (!config.autoApproveMachineRequests) {
    return createMachineRequest({
      ...input,
      logContext: 'Auto request',
      source: 'auto_extension',
    });
  }

  const context = await resolveMachineRequestContext({
    ...input,
    logContext: 'Auto request',
  });
  if (!context.ok) {
    return context;
  }

  const reasonText = input.reason ?? '';
  const sourceComment = input.originPage
    ? `Auto-approved via Firefox extension (${input.originPage.slice(0, 300)})${reasonText ? ` - ${reasonText}` : ''}`
    : `Auto-approved via Firefox extension${reasonText ? ` - ${reasonText}` : ''}`;

  try {
    const created: CreateRuleResult = await withTransaction(async (tx) =>
      groupsStorage.createRule(
        context.data.groupId,
        'whitelist',
        context.data.domain,
        sourceComment,
        'auto_extension',
        tx
      )
    );

    if (!created.success && created.error !== 'Rule already exists') {
      return {
        ok: false,
        error: { code: 'BAD_REQUEST', message: created.error ?? 'Could not create rule' },
      };
    }

    const duplicate = created.error === 'Rule already exists';
    if (!duplicate) {
      DomainEventsService.publishWhitelistChanged(context.data.groupId);
    }

    return {
      ok: true,
      data: {
        autoApproved: true,
        domain: context.data.domain,
        duplicate,
        groupId: context.data.groupId,
        source: 'auto_extension',
        status: duplicate ? 'duplicate' : 'approved',
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export default {
  handleAutoMachineRequest,
  submitMachineRequest,
};
