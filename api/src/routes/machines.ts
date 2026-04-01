import fs from 'node:fs';
import path from 'node:path';

import type { Express, Request, Response } from 'express';

import { getErrorMessage } from '@openpath/shared';

import { logger } from '../lib/logger.js';
import { config } from '../config.js';
import * as classroomStorage from '../lib/classroom-storage.js';
import * as groupsStorage from '../lib/groups-storage.js';
import * as setupStorage from '../lib/setup-storage.js';
import {
  ensureDbEventBridgeStarted,
  ensureScheduleBoundaryTickerStarted,
  getSseClientCount,
  registerSseClient,
} from '../lib/rule-events.js';
import { UNRESTRICTED_GROUP_ID } from '../lib/exemption-storage.js';
import {
  buildWhitelistUrl,
  generateMachineToken,
  hashMachineToken,
} from '../lib/machine-download-token.js';
import { verifyEnrollmentToken } from '../lib/enrollment-token.js';
import {
  authenticateEnrollmentToken,
  authenticateMachineToken,
  getFirstParam,
} from '../lib/server-request-auth.js';
import {
  buildLinuxAgentPackageManifest,
  buildStaticEtag,
  buildWhitelistEtag,
  buildWindowsAgentFileManifest,
  matchesIfNoneMatch,
  readServerVersion,
  resolveLinuxAgentPackagePath,
} from '../lib/server-assets.js';

const FAIL_OPEN_RESPONSE = '#DESACTIVADO\n';

export function registerMachineRoutes(
  app: Express,
  deps: { getCurrentEvaluationTime: () => Date }
): void {
  app.post('/api/machines/register', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ') !== true) {
        res.status(401).json({ success: false, error: 'Authorization header required' });
        return;
      }

      const providedToken = authHeader.slice(7);
      const enrollmentPayload = verifyEnrollmentToken(providedToken);

      const { hostname, classroomName, classroomId, version } = req.body as {
        hostname?: string;
        classroomName?: string;
        classroomId?: string;
        version?: string;
      };

      if (!hostname) {
        res.status(400).json({ success: false, error: 'hostname is required' });
        return;
      }

      const classroomLookup = await (async (): Promise<
        | { ok: true; classroom: { id: string; name: string } }
        | { ok: false; status: number; error: string }
      > => {
        if (enrollmentPayload) {
          if (classroomId && classroomId !== enrollmentPayload.classroomId) {
            return {
              ok: false,
              status: 403,
              error: 'Enrollment token does not match classroom',
            };
          }

          const classroom = await classroomStorage.getClassroomById(enrollmentPayload.classroomId);
          if (!classroom) {
            return { ok: false, status: 404, error: 'Classroom not found' };
          }

          return { ok: true, classroom };
        }

        const isValid = await setupStorage.validateRegistrationToken(providedToken);
        if (!isValid) {
          return { ok: false, status: 403, error: 'Invalid registration token' };
        }

        if (!classroomName) {
          return { ok: false, status: 400, error: 'classroomName is required' };
        }

        const classroom = await classroomStorage.getClassroomByName(classroomName);
        if (!classroom) {
          return { ok: false, status: 404, error: `Classroom "${classroomName}" not found` };
        }

        return { ok: true, classroom };
      })();

      if (!classroomLookup.ok) {
        res.status(classroomLookup.status).json({ success: false, error: classroomLookup.error });
        return;
      }

      const { classroom } = classroomLookup;
      const machineHostname = classroomStorage.buildMachineKey(classroom.id, hostname);

      const machine = await classroomStorage.registerMachine({
        hostname: machineHostname,
        reportedHostname: hostname,
        classroomId: classroom.id,
        ...(version ? { version } : {}),
      });

      const token = generateMachineToken();
      const tokenHash = hashMachineToken(token);
      await classroomStorage.setMachineDownloadTokenHash(machine.id, tokenHash);

      const publicUrl = config.publicUrl ?? `http://${config.host}:${String(config.port)}`;
      const whitelistUrl = buildWhitelistUrl(publicUrl, token);

      res.json({
        success: true,
        machineHostname: machine.hostname,
        reportedHostname: machine.reportedHostname ?? hostname,
        whitelistUrl,
        classroomName: classroom.name,
        classroomId: classroom.id,
      });
    })();
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

      const normalizedHostname = hostname.trim().toLowerCase();
      const reportedHostname = machine.reportedHostname?.trim().toLowerCase();
      if (
        normalizedHostname !== machine.hostname.trim().toLowerCase() &&
        normalizedHostname !== reportedHostname
      ) {
        res
          .status(403)
          .json({ success: false, error: 'Machine token is not valid for this hostname' });
        return;
      }

      const token = generateMachineToken();
      const tokenHash = hashMachineToken(token);
      await classroomStorage.setMachineDownloadTokenHash(machine.id, tokenHash);

      const publicUrl = config.publicUrl ?? `http://${config.host}:${String(config.port)}`;
      const whitelistUrl = buildWhitelistUrl(publicUrl, token);

      res.json({ success: true, whitelistUrl });
    })();
  });

  app.get('/api/agent/windows/bootstrap/latest.json', (req: Request, res: Response): void => {
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
        logger.error('Error serving Windows bootstrap manifest', { error: getErrorMessage(error) });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Internal error' });
        }
      }
    })();
  });

  app.get('/api/agent/windows/bootstrap/file', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const authenticated = await authenticateEnrollmentToken(req, res);
        if (!authenticated) {
          return;
        }

        const requestedPath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
        if (!requestedPath) {
          res.status(400).json({ success: false, error: 'path query parameter required' });
          return;
        }

        const files = buildWindowsAgentFileManifest({ includeBootstrapFiles: true });
        const file = files.find((entry) => entry.relativePath === requestedPath);
        if (!file) {
          res.status(404).json({ success: false, error: 'File not found in bootstrap package' });
          return;
        }

        const fileContents = fs.readFileSync(file.absolutePath);

        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.type('text/plain').send(fileContents);
      } catch (error) {
        logger.error('Error serving Windows bootstrap file', { error: getErrorMessage(error) });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Internal error' });
        }
      }
    })();
  });

  app.get('/api/agent/windows/latest.json', (req: Request, res: Response): void => {
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
        logger.error('Error serving Windows agent manifest', { error: getErrorMessage(error) });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Internal error' });
        }
      }
    })();
  });

  app.get('/api/agent/windows/file', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const machine = await authenticateMachineToken(req, res);
        if (!machine) {
          return;
        }

        const requestedPath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
        if (!requestedPath) {
          res.status(400).json({ success: false, error: 'path query parameter required' });
          return;
        }

        const files = buildWindowsAgentFileManifest();
        const file = files.find((entry) => entry.relativePath === requestedPath);
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
        logger.error('Error serving Windows agent file', { error: getErrorMessage(error) });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Internal error' });
        }
      }
    })();
  });

  app.get('/api/agent/linux/latest.json', (req: Request, res: Response): void => {
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
        logger.error('Error serving Linux agent manifest', { error: getErrorMessage(error) });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Internal error' });
        }
      }
    })();
  });

  app.get('/api/agent/linux/package', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const machine = await authenticateMachineToken(req, res);
        if (!machine) {
          return;
        }

        const requestedVersion =
          typeof req.query.version === 'string' ? req.query.version.trim() : '';
        if (!requestedVersion) {
          res.status(400).json({ success: false, error: 'version query parameter required' });
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
        logger.error('Error serving Linux agent package', { error: getErrorMessage(error) });
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

        const whitelistInfo = await classroomStorage.resolveMachineEnforcementContext(
          machine.hostname,
          deps.getCurrentEvaluationTime()
        );
        if (!whitelistInfo) {
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.type('text/plain').send(FAIL_OPEN_RESPONSE);
          return;
        }

        if (whitelistInfo.groupId === UNRESTRICTED_GROUP_ID) {
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

        const group = await groupsStorage.getGroupMetaById(whitelistInfo.groupId);
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

        const content = await groupsStorage.exportGroup(whitelistInfo.groupId);
        if (!content) {
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.type('text/plain').send(FAIL_OPEN_RESPONSE);
          return;
        }

        await classroomStorage.updateMachineLastSeen(machine.hostname);
        res.type('text/plain').send(content);
      } catch (error) {
        logger.error('Error serving tokenized whitelist', { error: getErrorMessage(error) });
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.type('text/plain').send(FAIL_OPEN_RESPONSE);
      }
    })();
  });

  app.get('/api/machines/events', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const authHeader = req.headers.authorization;
        const machineToken = authHeader?.startsWith('Bearer ')
          ? authHeader.slice(7)
          : typeof req.query.token === 'string'
            ? req.query.token
            : '';
        if (!machineToken) {
          res.status(401).json({
            success: false,
            error: 'Machine token required (Authorization: Bearer or query param)',
          });
          return;
        }

        const tokenHash = hashMachineToken(machineToken);
        const machine = await classroomStorage.getMachineByDownloadTokenHash(tokenHash);
        if (!machine) {
          res.status(403).json({ success: false, error: 'Invalid machine token' });
          return;
        }

        const whitelistInfo = await classroomStorage.getWhitelistUrlForMachine(machine.hostname);
        if (!whitelistInfo) {
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
            groupId: whitelistInfo.groupId,
            hostname: machine.hostname,
          })}\n\n`
        );

        const unsubscribe = registerSseClient({
          hostname: machine.hostname,
          classroomId: whitelistInfo.classroomId,
          groupId: whitelistInfo.groupId,
          stream: res,
        });

        logger.info('SSE client connected', {
          hostname: machine.hostname,
          classroomId: whitelistInfo.classroomId,
          groupId: whitelistInfo.groupId,
          clients: getSseClientCount(),
        });

        await classroomStorage.updateMachineLastSeen(machine.hostname);

        req.on('close', () => {
          unsubscribe();
          logger.info('SSE client disconnected', {
            hostname: machine.hostname,
            classroomId: whitelistInfo.classroomId,
            groupId: whitelistInfo.groupId,
            clients: getSseClientCount(),
          });
        });
      } catch (error) {
        logger.error('SSE endpoint error', { error: getErrorMessage(error) });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Internal error' });
        }
      }
    })();
  });
}
