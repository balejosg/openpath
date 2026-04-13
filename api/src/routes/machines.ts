import fs from 'node:fs';
import path from 'node:path';

import type { Express, Request, Response } from 'express';

import { logger } from '../lib/logger.js';
import * as classroomStorage from '../lib/classroom-storage.js';
import * as groupsStorage from '../lib/groups-storage.js';
import {
  ensureDbEventBridgeStarted,
  ensureScheduleBoundaryTickerStarted,
  getSseClientCount,
  registerSseClient,
} from '../lib/rule-events.js';
import { hashMachineToken } from '../lib/machine-download-token.js';
import {
  authenticateEnrollmentToken,
  authenticateMachineToken,
  getFirstParam,
  getBearerTokenValue,
  resolveMachineTokenAccess,
  validateMachineHostnameAccess,
} from '../lib/server-request-auth.js';
import {
  buildLinuxAgentPackageManifest,
  buildStaticEtag,
  buildWhitelistEtag,
  buildWindowsAgentFileManifest,
  matchesIfNoneMatch,
  readServerVersion,
  resolveLinuxAgentPackagePath,
  resolveWindowsAgentManifestFile,
} from '../lib/server-assets.js';
import {
  registerMachineWithToken,
  rotateMachineDownloadToken,
} from '../services/machine-registration.service.js';

const FAIL_OPEN_RESPONSE = '#DESACTIVADO\n';

function getWildcardPathParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join('/');
  }

  return value?.trim() ?? '';
}

function sendMachineServiceError(res: Response, error: { code: string; message: string }): void {
  const statusMap: Record<string, number> = {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    BAD_REQUEST: 400,
  };
  res.status(statusMap[error.code] ?? 400).json({ success: false, error: error.message });
}

export function registerMachineRoutes(
  app: Express,
  deps: { getCurrentEvaluationTime: () => Date }
): void {
  app.post('/api/machines/register', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      const { hostname, classroomName, classroomId, version } = req.body as {
        hostname?: string;
        classroomName?: string;
        classroomId?: string;
        version?: string;
      };

      const result = await registerMachineWithToken({
        authorizationHeader: req.headers.authorization,
        hostname,
        classroomName,
        classroomId,
        version,
      });
      if (!result.ok) {
        sendMachineServiceError(res, result.error);
        return;
      }

      res.json({
        success: true,
        machineHostname: result.data.machineHostname,
        reportedHostname: result.data.reportedHostname,
        whitelistUrl: result.data.whitelistUrl,
        classroomName: result.data.classroomName,
        classroomId: result.data.classroomId,
      });
    })().catch((error: unknown) => {
      logger.error('Machine registration route failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    });
  });

  app.post('/api/machines/:hostname/rotate-download-token', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      const machine = await authenticateMachineToken(req, res);
      if (!machine) {
        return;
      }

      const hostname = getFirstParam(req.params.hostname);
      if (!hostname) {
        res.status(400).json({ success: false, error: 'hostname parameter required' });
        return;
      }

      const hostnameAccess = validateMachineHostnameAccess(machine, hostname);
      if (!hostnameAccess.ok) {
        res
          .status(403)
          .json({ success: false, error: 'Machine token is not valid for this hostname' });
        return;
      }

      const result = await rotateMachineDownloadToken(machine.id);
      if (!result.ok) {
        sendMachineServiceError(res, result.error);
        return;
      }

      res.json({ success: true, whitelistUrl: result.data.whitelistUrl });
    })().catch((error: unknown) => {
      logger.error('Rotate machine download token route failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    });
  });

  app.get('/api/agent/windows/bootstrap/manifest', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const enrollment = await authenticateEnrollmentToken(req, res);
        if (!enrollment) {
          return;
        }

        const files = buildWindowsAgentFileManifest({ includeBootstrapFiles: true });
        if (files.length === 0) {
          res.status(503).json({ success: false, error: 'Windows bootstrap package unavailable' });
          return;
        }

        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.json({
          success: true,
          classroomId: enrollment.classroomId,
          version: readServerVersion(),
          generatedAt: new Date().toISOString(),
          files: files.map((file) => ({
            path: file.relativePath,
            sha256: file.sha256,
            size: file.size,
          })),
        });
      } catch (error) {
        logger.error('Error serving Windows bootstrap manifest', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Internal error' });
        }
      }
    })();
  });

  app.get('/api/agent/windows/bootstrap/files/*path', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const authenticated = await authenticateEnrollmentToken(req, res);
        if (!authenticated) {
          return;
        }

        const requestedPath = getWildcardPathParam(req.params.path);
        if (!requestedPath) {
          res.status(400).json({ success: false, error: 'file path required' });
          return;
        }

        const file = resolveWindowsAgentManifestFile(requestedPath, {
          includeBootstrapFiles: true,
        });
        if (!file) {
          res.status(404).json({ success: false, error: 'File not found in bootstrap package' });
          return;
        }

        const fileContents = fs.readFileSync(file.absolutePath);

        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.type('text/plain').send(fileContents);
      } catch (error) {
        logger.error('Error serving Windows bootstrap file', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Internal error' });
        }
      }
    })();
  });

  app.get('/api/agent/windows/manifest', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const machine = await authenticateMachineToken(req, res);
        if (!machine) {
          return;
        }

        const files = buildWindowsAgentFileManifest();
        if (files.length === 0) {
          res.status(503).json({ success: false, error: 'Windows agent package unavailable' });
          return;
        }

        await classroomStorage.updateMachineLastSeen(machine.hostname);

        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.json({
          success: true,
          version: readServerVersion(),
          generatedAt: new Date().toISOString(),
          files: files.map((file) => ({
            path: file.relativePath,
            sha256: file.sha256,
            size: file.size,
          })),
        });
      } catch (error) {
        logger.error('Error serving Windows agent manifest', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Internal error' });
        }
      }
    })();
  });

  app.get('/api/agent/windows/files/*path', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const machine = await authenticateMachineToken(req, res);
        if (!machine) {
          return;
        }

        const requestedPath = getWildcardPathParam(req.params.path);
        if (!requestedPath) {
          res.status(400).json({ success: false, error: 'file path required' });
          return;
        }

        const file = resolveWindowsAgentManifestFile(requestedPath);
        if (!file) {
          res.status(404).json({ success: false, error: 'File not found in agent package' });
          return;
        }

        const fileContents = fs.readFileSync(file.absolutePath);

        await classroomStorage.updateMachineLastSeen(machine.hostname);

        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.type('text/plain').send(fileContents);
      } catch (error) {
        logger.error('Error serving Windows agent file', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Internal error' });
        }
      }
    })();
  });

  app.get('/api/agent/linux/manifest', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const machine = await authenticateMachineToken(req, res);
        if (!machine) {
          return;
        }

        const packageEntry = buildLinuxAgentPackageManifest();
        if (!packageEntry) {
          res.status(503).json({ success: false, error: 'Linux agent package unavailable' });
          return;
        }

        await classroomStorage.updateMachineLastSeen(machine.hostname);

        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.json({
          success: true,
          version: packageEntry.version,
          generatedAt: new Date().toISOString(),
          packageFileName: packageEntry.packageFileName,
          sha256: packageEntry.sha256,
          size: packageEntry.size,
          minSupportedVersion: packageEntry.minSupportedVersion,
          minDirectUpgradeVersion: packageEntry.minDirectUpgradeVersion,
          bridgeVersions: packageEntry.bridgeVersions,
          downloadPath: packageEntry.downloadPath,
        });
      } catch (error) {
        logger.error('Error serving Linux agent manifest', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Internal error' });
        }
      }
    })();
  });

  app.get('/api/agent/linux/packages/:version', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const machine = await authenticateMachineToken(req, res);
        if (!machine) {
          return;
        }

        const requestedVersion = getFirstParam(req.params.version)?.trim() ?? '';
        if (!requestedVersion) {
          res.status(400).json({ success: false, error: 'version path parameter required' });
          return;
        }

        const absolutePath = resolveLinuxAgentPackagePath(requestedVersion);
        if (!absolutePath) {
          res.status(503).json({ success: false, error: 'Linux agent package unavailable' });
          return;
        }

        await classroomStorage.updateMachineLastSeen(machine.hostname);

        const packageContents = fs.readFileSync(absolutePath);
        const packageFileName = path.basename(absolutePath);

        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Content-Disposition', `attachment; filename="${packageFileName}"`);
        res.type('application/vnd.debian.binary-package').send(packageContents);
      } catch (error) {
        logger.error('Error serving Linux agent package', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Internal error' });
        }
      }
    })();
  });

  app.get('/w/whitelist.txt', (_req: Request, res: Response): void => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.type('text/plain').send(FAIL_OPEN_RESPONSE);
  });

  app.get('/w/:machineToken/whitelist.txt', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const machineToken = getFirstParam(req.params.machineToken);
        if (!machineToken) {
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.type('text/plain').send(FAIL_OPEN_RESPONSE);
          return;
        }

        const tokenHash = hashMachineToken(machineToken);
        const machine = await classroomStorage.getMachineByDownloadTokenHash(tokenHash);
        if (!machine) {
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.type('text/plain').send(FAIL_OPEN_RESPONSE);
          return;
        }

        const effectiveContext =
          await classroomStorage.resolveEffectiveMachineEnforcementPolicyContext(
            machine.hostname,
            deps.getCurrentEvaluationTime()
          );
        if (!effectiveContext) {
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.type('text/plain').send(FAIL_OPEN_RESPONSE);
          return;
        }

        if (effectiveContext.mode === 'unrestricted') {
          const etag = buildStaticEtag('openpath:unrestricted');
          res.setHeader('ETag', etag);
          res.setHeader('Cache-Control', 'private, no-cache');
          if (matchesIfNoneMatch(req, etag)) {
            await classroomStorage.updateMachineLastSeen(machine.hostname);
            res.status(304).end();
            return;
          }

          await classroomStorage.updateMachineLastSeen(machine.hostname);
          res.type('text/plain').send(FAIL_OPEN_RESPONSE);
          return;
        }

        if (!effectiveContext.groupId) {
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.type('text/plain').send(FAIL_OPEN_RESPONSE);
          return;
        }

        const group = await groupsStorage.getGroupMetaById(effectiveContext.groupId);
        if (!group) {
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.type('text/plain').send(FAIL_OPEN_RESPONSE);
          return;
        }

        const etag = buildWhitelistEtag({
          groupId: group.id,
          updatedAt: group.updatedAt,
          enabled: group.enabled,
        });
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'private, no-cache');
        if (matchesIfNoneMatch(req, etag)) {
          await classroomStorage.updateMachineLastSeen(machine.hostname);
          res.status(304).end();
          return;
        }

        const content = await groupsStorage.exportGroup(effectiveContext.groupId);
        if (!content) {
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.type('text/plain').send(FAIL_OPEN_RESPONSE);
          return;
        }

        await classroomStorage.updateMachineLastSeen(machine.hostname);
        res.type('text/plain').send(content);
      } catch (error) {
        logger.error('Error serving tokenized whitelist', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.type('text/plain').send(FAIL_OPEN_RESPONSE);
      }
    })();
  });

  app.get('/api/machines/events', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const machineToken =
          getBearerTokenValue(req.headers.authorization) ??
          (typeof req.query.token === 'string' ? req.query.token.trim() : '');
        if (!machineToken) {
          res.status(401).json({
            success: false,
            error: 'Machine token required (Authorization: Bearer or query param)',
          });
          return;
        }

        const machine = await resolveMachineTokenAccess(machineToken);
        if (!machine) {
          res.status(403).json({ success: false, error: 'Invalid machine token' });
          return;
        }

        const effectiveContext =
          await classroomStorage.resolveEffectiveMachineEnforcementPolicyContext(machine.hostname);
        if (!effectiveContext) {
          res.status(404).json({ success: false, error: 'No active group for this machine' });
          return;
        }

        const serializedGroupId = classroomStorage.serializePolicyGroupId(effectiveContext);
        if (!serializedGroupId) {
          res.status(404).json({ success: false, error: 'No active group for this machine' });
          return;
        }

        await ensureDbEventBridgeStarted();
        void ensureScheduleBoundaryTickerStarted();

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        res.write(
          `data: ${JSON.stringify({
            event: 'connected',
            groupId: serializedGroupId,
            hostname: machine.hostname,
          })}\n\n`
        );

        const unsubscribe = registerSseClient({
          hostname: machine.hostname,
          classroomId: effectiveContext.classroomId,
          groupId: serializedGroupId,
          stream: res,
        });

        logger.info('SSE client connected', {
          hostname: machine.hostname,
          classroomId: effectiveContext.classroomId,
          groupId: serializedGroupId,
          clients: getSseClientCount(),
        });

        await classroomStorage.updateMachineLastSeen(machine.hostname);

        req.on('close', () => {
          unsubscribe();
          logger.info('SSE client disconnected', {
            hostname: machine.hostname,
            classroomId: effectiveContext.classroomId,
            groupId: serializedGroupId,
            clients: getSseClientCount(),
          });
        });
      } catch (error) {
        logger.error('SSE endpoint error', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Internal error' });
        }
      }
    })();
  });
}
