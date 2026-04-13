import type { Express, Request, Response } from 'express';

import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { emitWhitelistChanged } from '../lib/rule-events.js';
import * as classroomStorage from '../lib/classroom-storage.js';
import * as groupsStorage from '../lib/groups-storage.js';
import { withTransaction } from '../db/index.js';
import RequestService from '../services/request.service.js';
import { normalizeHostInput } from '../lib/machine-proof.js';
import {
  parseAutoRequestPayload,
  parseSubmitRequestPayload,
  parseWhitelistDomain,
} from '../lib/public-request-input.js';
import { resolveMachineTokenHostnameAccess } from '../lib/server-request-auth.js';

async function requireValidMachineToken(params: {
  hostnameRaw: string;
  token: string;
  logContext: string;
  res: Response;
}): Promise<{ ok: true; machineHostname: string; requestedHostname: string } | { ok: false }> {
  const hostname = normalizeHostInput(params.hostnameRaw);
  const access = await resolveMachineTokenHostnameAccess({
    machineToken: params.token,
    hostname,
  });

  if (!access.ok && access.error === 'invalid-token') {
    logger.warn(`${params.logContext} rejected: invalid machine token`, { hostname });
    params.res.status(403).json({ success: false, error: 'Invalid machine token' });
    return { ok: false };
  }

  if (!access.ok) {
    logger.warn(`${params.logContext} rejected: hostname mismatch`, {
      requestedHostname: access.requestedHostname,
      machineHostname: access.machine?.hostname.trim().toLowerCase(),
      reportedHostname: access.machine?.reportedHostname?.trim().toLowerCase(),
    });
    params.res.status(403).json({ success: false, error: 'Token is not valid for this hostname' });
    return { ok: false };
  }

  return {
    ok: true,
    machineHostname: access.machine.hostname,
    requestedHostname: access.requestedHostname,
  };
}

function sendRequestServiceError(res: Response, error: { code: string; message: string }): void {
  const statusMap: Record<string, number> = {
    CONFLICT: 409,
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    BAD_REQUEST: 400,
  };
  const statusCode = statusMap[error.code] ?? 400;
  res.status(statusCode).json({
    success: false,
    error: error.message,
  });
}

async function resolveMachineRequestContext(params: {
  hostnameRaw: string;
  token: string;
  domainRaw: string;
  logContext: string;
  res: Response;
}): Promise<
  { ok: true; machineHostname: string; groupId: string; domain: string } | { ok: false }
> {
  const proof = await requireValidMachineToken({
    hostnameRaw: params.hostnameRaw,
    token: params.token,
    logContext: params.logContext,
    res: params.res,
  });
  if (!proof.ok) {
    return { ok: false };
  }

  const domainParse = parseWhitelistDomain(params.domainRaw);
  if (!domainParse.ok) {
    params.res.status(400).json({ success: false, error: domainParse.error });
    return { ok: false };
  }

  const policyContext = await classroomStorage.resolveEffectiveMachinePolicyContext(
    proof.machineHostname
  );
  if (!policyContext) {
    params.res.status(404).json({
      success: false,
      error: 'No active group found for machine hostname',
    });
    return { ok: false };
  }

  if (policyContext.mode === 'unrestricted' || !policyContext.groupId) {
    params.res.status(400).json({
      success: false,
      error: 'Machine classroom is unrestricted and does not require access requests',
    });
    return { ok: false };
  }

  return {
    ok: true,
    machineHostname: proof.machineHostname,
    groupId: policyContext.groupId,
    domain: domainParse.domain,
  };
}

export function registerPublicRequestRoutes(app: Express): void {
  app.post('/api/requests/auto', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      const body = parseAutoRequestPayload(req.body);

      if (!body.domainRaw || !body.hostnameRaw || !body.token) {
        res.status(400).json({
          success: false,
          error: 'domain, hostname and token are required',
        });
        return;
      }

      const context = await resolveMachineRequestContext({
        hostnameRaw: body.hostnameRaw,
        token: body.token,
        domainRaw: body.domainRaw,
        logContext: 'Auto request',
        res,
      });
      if (!context.ok) {
        return;
      }
      const targetGroupId = context.groupId;
      if (!config.autoApproveMachineRequests) {
        const created = await RequestService.createRequest({
          domain: context.domain,
          reason: body.reasonRaw.slice(0, 200) || 'Submitted via Firefox extension auto request',
          groupId: targetGroupId,
          source: 'auto_extension',
          machineHostname: context.machineHostname,
          originPage: body.originPageRaw.slice(0, 2048) || undefined,
        });

        if (!created.ok) {
          sendRequestServiceError(res, created.error);
          return;
        }

        res.json({
          success: true,
          id: created.data.id,
          approved: false,
          autoApproved: false,
          status: created.data.status,
          groupId: targetGroupId,
          domain: context.domain,
          source: 'auto_extension',
        });
        return;
      }

      const reasonText = body.reasonRaw.slice(0, 200);
      const sourceComment = body.originPageRaw
        ? `Auto-approved via Firefox extension (${body.originPageRaw.slice(0, 300)})${reasonText ? ` - ${reasonText}` : ''}`
        : `Auto-approved via Firefox extension${reasonText ? ` - ${reasonText}` : ''}`;

      const created = await withTransaction(async (tx) =>
        groupsStorage.createRule(
          targetGroupId,
          'whitelist',
          context.domain,
          sourceComment,
          'auto_extension',
          tx
        )
      );

      if (!created.success && created.error !== 'Rule already exists') {
        res.status(400).json({ success: false, error: created.error ?? 'Could not create rule' });
        return;
      }

      res.json({
        success: true,
        approved: true,
        autoApproved: true,
        status: created.error === 'Rule already exists' ? 'duplicate' : 'approved',
        groupId: targetGroupId,
        domain: context.domain,
        source: 'auto_extension',
        duplicate: created.error === 'Rule already exists',
      });

      if (created.error !== 'Rule already exists') {
        emitWhitelistChanged(targetGroupId);
      }
    })().catch((error: unknown) => {
      logger.error('Auto request route failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    });
  });

  app.post('/api/requests/submit', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      const body = parseSubmitRequestPayload(req.body);

      if (!body.domainRaw || !body.hostnameRaw || !body.token) {
        res.status(400).json({
          success: false,
          error: 'domain, hostname and token are required',
        });
        return;
      }

      const context = await resolveMachineRequestContext({
        hostnameRaw: body.hostnameRaw,
        token: body.token,
        domainRaw: body.domainRaw,
        logContext: 'Request submit',
        res,
      });
      if (!context.ok) {
        return;
      }

      const created = await RequestService.createRequest({
        domain: context.domain,
        reason: body.reasonRaw.slice(0, 200) || 'Submitted via Firefox extension',
        groupId: context.groupId,
        source: 'firefox-extension',
        machineHostname: context.machineHostname,
        originHost: body.originHostRaw.slice(0, 255) || undefined,
        originPage: body.originPageRaw.slice(0, 2048) || undefined,
        clientVersion: body.clientVersionRaw.slice(0, 50) || undefined,
        errorType: body.errorTypeRaw.slice(0, 100) || undefined,
      });

      if (!created.ok) {
        sendRequestServiceError(res, created.error);
        return;
      }

      res.json({
        success: true,
        id: created.data.id,
        status: created.data.status,
        groupId: context.groupId,
        domain: context.domain,
        source: 'firefox-extension',
      });
    })().catch((error: unknown) => {
      logger.error('Request submit route failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    });
  });
}
