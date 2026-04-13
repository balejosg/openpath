import type { Express, Request, Response } from 'express';

import { getFirstParam, verifyAccessTokenFromRequest } from '../lib/server-request-auth.js';
import { getPublicBaseUrl } from '../lib/server-assets.js';
import {
  buildLinuxEnrollmentBootstrap,
  buildWindowsEnrollmentBootstrap,
  issueEnrollmentTicket,
} from '../services/enrollment.service.js';
import {
  createAsyncRouteHandler,
  sendJsonInternalError,
  sendTextInternalError,
} from './route-helpers.js';

function sendEnrollmentServiceErrorJson(
  res: Response,
  error: { code: string; message: string }
): void {
  const statusMap: Record<string, number> = {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    BAD_REQUEST: 400,
    MISCONFIGURED: 500,
  };
  res.status(statusMap[error.code] ?? 400).json({ success: false, error: error.message });
}

function sendEnrollmentServiceErrorText(
  res: Response,
  error: { code: string; message: string }
): void {
  const statusMap: Record<string, number> = {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    BAD_REQUEST: 400,
    MISCONFIGURED: 500,
  };
  res.status(statusMap[error.code] ?? 400).send(error.message);
}

export function registerEnrollmentRoutes(app: Express): void {
  app.post(
    '/api/enroll/:classroomId/ticket',
    createAsyncRouteHandler(
      'Enrollment ticket error',
      sendJsonInternalError,
      async (req: Request, res: Response): Promise<void> => {
        const decoded = await verifyAccessTokenFromRequest(req);
        if (!decoded) {
          res.status(401).json({ success: false, error: 'Authorization required' });
          return;
        }

        const result = await issueEnrollmentTicket({
          user: decoded,
          classroomId: getFirstParam(req.params.classroomId) ?? '',
        });
        if (!result.ok) {
          sendEnrollmentServiceErrorJson(res, result.error);
          return;
        }

        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.json({
          success: true,
          enrollmentToken: result.data.enrollmentToken,
          classroomId: result.data.classroomId,
          classroomName: result.data.classroomName,
        });
      }
    )
  );

  app.get(
    '/api/enroll/:classroomId',
    createAsyncRouteHandler(
      'Enrollment script error',
      sendTextInternalError,
      async (req: Request, res: Response): Promise<void> => {
        const classroomId = getFirstParam(req.params.classroomId);
        const result = await buildLinuxEnrollmentBootstrap({
          authorizationHeader: req.headers.authorization,
          classroomId: classroomId ?? '',
          publicUrl: getPublicBaseUrl(req),
        });
        if (!result.ok) {
          sendEnrollmentServiceErrorText(res, result.error);
          return;
        }

        res.setHeader('Content-Type', 'text/x-shellscript');
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline; filename="enroll.sh"');
        res.send(result.data.script);
      }
    )
  );

  app.get(
    '/api/enroll/:classroomId/windows.ps1',
    createAsyncRouteHandler(
      'Windows enrollment script error',
      sendTextInternalError,
      async (req: Request, res: Response): Promise<void> => {
        const result = await buildWindowsEnrollmentBootstrap({
          authorizationHeader: req.headers.authorization,
          classroomId: getFirstParam(req.params.classroomId) ?? '',
          publicUrl: getPublicBaseUrl(req),
        });
        if (!result.ok) {
          sendEnrollmentServiceErrorText(res, result.error);
          return;
        }

        res.setHeader('Content-Type', 'text/x-powershell');
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline; filename="enroll.ps1"');
        res.send(result.data.script);
      }
    )
  );
}
