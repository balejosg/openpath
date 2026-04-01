import type { Express, Request, Response } from 'express';

import { getErrorMessage } from '@openpath/shared';

import { logger } from '../lib/logger.js';
import * as classroomStorage from '../lib/classroom-storage.js';
import { verifyAccessTokenFromRequest } from '../lib/server-request-auth.js';
import { runScheduleBoundaryTickOnce } from '../lib/rule-events.js';
import { config } from '../config.js';

function getBodyField(body: unknown, key: string): unknown {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  return (body as Record<string, unknown>)[key];
}

async function requireTeacherOrAdmin(req: Request, res: Response): Promise<boolean> {
  const decoded = await verifyAccessTokenFromRequest(req);
  if (!decoded) {
    res.status(401).json({ success: false, error: 'Authorization required' });
    return false;
  }

  const roles = decoded.roles.map((r) => r.role);
  if (!roles.includes('admin') && !roles.includes('teacher')) {
    res.status(403).json({ success: false, error: 'Teacher access required' });
    return false;
  }

  return true;
}

export function registerTestSupportRoutes(
  app: Express,
  deps: {
    getCurrentEvaluationTime: () => Date;
    setTestNowOverride: (nextValue: Date | null) => void;
  }
): void {
  if (!config.isTest) {
    return;
  }

  app.get('/api/test-support/machine-context/:hostname', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const authorized = await requireTeacherOrAdmin(req, res);
        if (!authorized) return;

        const hostname = Array.isArray(req.params.hostname)
          ? req.params.hostname[0]
          : req.params.hostname;
        if (!hostname) {
          res.status(400).json({ success: false, error: 'hostname is required' });
          return;
        }

        const now = deps.getCurrentEvaluationTime();
        const machine = await classroomStorage.getMachineByHostname(hostname);
        const context = await classroomStorage.resolveMachineEnforcementContext(hostname, now);
        const classroom = machine?.classroomId
          ? await classroomStorage.getClassroomById(machine.classroomId)
          : null;

        res.json({
          success: true,
          machine: machine
            ? {
                id: machine.id,
                hostname: machine.hostname,
                reportedHostname: machine.reportedHostname,
                classroomId: machine.classroomId,
              }
            : null,
          context,
          classroom: classroom
            ? {
                id: classroom.id,
                defaultGroupId: classroom.defaultGroupId,
                activeGroupId: classroom.activeGroupId,
              }
            : null,
        });
      } catch (error) {
        logger.error('Test-support machine context error', { error: getErrorMessage(error) });
        res.status(500).json({ success: false, error: 'Internal error' });
      }
    })();
  });

  app.post('/api/test-support/auto-approve', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const authorized = await requireTeacherOrAdmin(req, res);
        if (!authorized) return;

        const enabled = getBodyField(req.body as unknown, 'enabled');
        if (typeof enabled !== 'boolean') {
          res.status(400).json({ success: false, error: 'enabled boolean is required' });
          return;
        }

        Object.defineProperty(config, 'autoApproveMachineRequests', {
          value: enabled,
          writable: true,
          configurable: true,
          enumerable: true,
        });

        res.json({ success: true, enabled: config.autoApproveMachineRequests });
      } catch (error) {
        logger.error('Test-support auto-approve error', { error: getErrorMessage(error) });
        res.status(500).json({ success: false, error: 'Internal error' });
      }
    })();
  });

  app.post('/api/test-support/clock', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const authorized = await requireTeacherOrAdmin(req, res);
        if (!authorized) return;

        const rawAt = getBodyField(req.body as unknown, 'at');
        if (rawAt === null) {
          deps.setTestNowOverride(null);
          res.json({ success: true, now: null });
          return;
        }

        if (typeof rawAt !== 'string' || rawAt.trim() === '') {
          res.status(400).json({ success: false, error: 'at must be an ISO timestamp or null' });
          return;
        }

        const at = new Date(rawAt);
        if (!Number.isFinite(at.getTime())) {
          res.status(400).json({ success: false, error: 'at must be a valid ISO timestamp' });
          return;
        }

        deps.setTestNowOverride(at);
        res.json({ success: true, now: at.toISOString() });
      } catch (error) {
        logger.error('Test-support clock error', { error: getErrorMessage(error) });
        res.status(500).json({ success: false, error: 'Internal error' });
      }
    })();
  });

  app.post('/api/test-support/tick-boundaries', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const authorized = await requireTeacherOrAdmin(req, res);
        if (!authorized) return;

        const rawAt = getBodyField(req.body as unknown, 'at');
        if (typeof rawAt !== 'string' || rawAt.trim() === '') {
          res.status(400).json({ success: false, error: 'at ISO timestamp is required' });
          return;
        }

        const at = new Date(rawAt);
        if (!Number.isFinite(at.getTime())) {
          res.status(400).json({ success: false, error: 'at must be a valid ISO timestamp' });
          return;
        }

        await runScheduleBoundaryTickOnce(at);
        res.json({ success: true, at: at.toISOString() });
      } catch (error) {
        logger.error('Test-support schedule tick error', { error: getErrorMessage(error) });
        res.status(500).json({ success: false, error: 'Internal error' });
      }
    })();
  });
}
