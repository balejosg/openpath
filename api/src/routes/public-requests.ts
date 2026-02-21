import type { Express, Request, Response } from 'express';

import { logger } from '../lib/logger.js';
import { touchGroupAndEmitWhitelistChanged } from '../lib/rule-events.js';
import * as classroomStorage from '../lib/classroom-storage.js';
import * as groupsStorage from '../lib/groups-storage.js';
import { RequestService } from '../services/index.js';
import { isValidMachineProofToken, normalizeHostInput } from '../lib/machine-proof.js';
import {
  parseAutoRequestPayload,
  parseSubmitRequestPayload,
  parseWhitelistDomain,
} from '../lib/public-request-input.js';

function requireValidMachineProofToken(params: {
  hostnameRaw: string;
  token: string;
  sharedSecret: string;
  logContext: string;
  res: Response;
}): { ok: true; hostname: string } | { ok: false } {
  const hostname = normalizeHostInput(params.hostnameRaw);
  if (!isValidMachineProofToken(hostname, params.token, params.sharedSecret)) {
    logger.warn(`${params.logContext} rejected: invalid proof token`, { hostname });
    params.res.status(403).json({ success: false, error: 'Invalid token proof' });
    return { ok: false };
  }

  return { ok: true, hostname };
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

      const sharedSecret = process.env.SHARED_SECRET;
      if (!sharedSecret) {
        res.status(500).json({ success: false, error: 'SHARED_SECRET not configured' });
        return;
      }

      const proof = requireValidMachineProofToken({
        hostnameRaw: body.hostnameRaw,
        token: body.token,
        sharedSecret,
        logContext: 'Auto request',
        res,
      });
      if (!proof.ok) {
        return;
      }

      const domainParse = parseWhitelistDomain(body.domainRaw);
      if (!domainParse.ok) {
        res.status(400).json({ success: false, error: domainParse.error });
        return;
      }

      const groupContext = await classroomStorage.getWhitelistUrlForMachine(proof.hostname);
      if (!groupContext) {
        res.status(404).json({
          success: false,
          error: 'No active group found for machine hostname',
        });
        return;
      }

      const targetGroupId = groupContext.groupId;
      const reasonText = body.reasonRaw.slice(0, 200);
      const sourceComment = body.originPageRaw
        ? `Auto-approved via Firefox extension (${body.originPageRaw.slice(0, 300)})${reasonText ? ` - ${reasonText}` : ''}`
        : `Auto-approved via Firefox extension${reasonText ? ` - ${reasonText}` : ''}`;

      const created = await groupsStorage.createRule(
        targetGroupId,
        'whitelist',
        domainParse.domain,
        sourceComment,
        'auto_extension'
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
        domain: domainParse.domain,
        source: 'auto_extension',
        duplicate: created.error === 'Rule already exists',
      });

      if (created.error !== 'Rule already exists') {
        await touchGroupAndEmitWhitelistChanged(targetGroupId);
      }
    })();
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

      const sharedSecret = process.env.SHARED_SECRET;
      if (!sharedSecret) {
        res.status(500).json({ success: false, error: 'SHARED_SECRET not configured' });
        return;
      }

      const proof = requireValidMachineProofToken({
        hostnameRaw: body.hostnameRaw,
        token: body.token,
        sharedSecret,
        logContext: 'Request submit',
        res,
      });
      if (!proof.ok) {
        return;
      }

      const domainParse = parseWhitelistDomain(body.domainRaw);
      if (!domainParse.ok) {
        res.status(400).json({ success: false, error: domainParse.error });
        return;
      }

      const groupContext = await classroomStorage.getWhitelistUrlForMachine(proof.hostname);
      if (!groupContext) {
        res.status(404).json({
          success: false,
          error: 'No active group found for machine hostname',
        });
        return;
      }

      const created = await RequestService.createRequest({
        domain: domainParse.domain,
        reason: body.reasonRaw.slice(0, 200) || 'Submitted via Firefox extension',
        groupId: groupContext.groupId,
        source: 'firefox-extension',
        machineHostname: proof.hostname,
        originHost: body.originHostRaw.slice(0, 255) || undefined,
        originPage: body.originPageRaw.slice(0, 2048) || undefined,
        clientVersion: body.clientVersionRaw.slice(0, 50) || undefined,
        errorType: body.errorTypeRaw.slice(0, 100) || undefined,
      });

      if (!created.ok) {
        const statusMap: Record<string, number> = {
          CONFLICT: 409,
          NOT_FOUND: 404,
          FORBIDDEN: 403,
          BAD_REQUEST: 400,
        };
        const statusCode = statusMap[created.error.code] ?? 400;
        res.status(statusCode).json({
          success: false,
          error: created.error.message,
        });
        return;
      }

      res.json({
        success: true,
        id: created.data.id,
        status: created.data.status,
        groupId: groupContext.groupId,
        domain: domainParse.domain,
        source: 'firefox-extension',
      });
    })();
  });
}
