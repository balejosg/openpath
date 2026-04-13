import type { Express, Request, Response } from 'express';

import * as setupStorage from '../lib/setup-storage.js';
import { verifyAccessTokenFromRequest } from '../lib/server-request-auth.js';
import SetupService from '../services/setup.service.js';
import { createAsyncRouteHandler, sendJsonInternalError } from './route-helpers.js';

function hasAdminRole(decoded: { roles: unknown[] }): boolean {
  return decoded.roles.some((role): boolean => {
    if (typeof role !== 'object' || role === null || !('role' in role)) {
      return false;
    }

    return (role as { role?: unknown }).role === 'admin';
  });
}

export function registerSetupRoutes(app: Express): void {
  app.get(
    '/api/setup/status',
    createAsyncRouteHandler(
      'Setup status route failed',
      sendJsonInternalError,
      async (_req: Request, res: Response): Promise<void> => {
        const status = await SetupService.getStatus();
        res.json(status);
      }
    )
  );

  app.post(
    '/api/setup/first-admin',
    createAsyncRouteHandler(
      'Setup first-admin route failed',
      sendJsonInternalError,
      async (req: Request, res: Response): Promise<void> => {
        const { email, name, password } = req.body as {
          email?: string;
          name?: string;
          password?: string;
        };

        if (!email || !name || !password) {
          res.status(400).json({
            success: false,
            error: 'Email, name, and password are required',
          });
          return;
        }

        const result = await SetupService.createFirstAdmin({ email, name, password });

        if (!result.ok) {
          const statusMap: Record<string, number> = {
            SETUP_ALREADY_COMPLETED: 403,
            EMAIL_EXISTS: 409,
            INVALID_INPUT: 400,
          };
          const statusCode = statusMap[result.error.code] ?? 400;
          res.status(statusCode).json({
            success: false,
            error: result.error.message,
          });
          return;
        }

        res.json(result.data);
      }
    )
  );

  app.get(
    '/api/setup/registration-token',
    createAsyncRouteHandler(
      'Setup registration-token route failed',
      sendJsonInternalError,
      async (req: Request, res: Response): Promise<void> => {
        const decoded = await verifyAccessTokenFromRequest(req);
        if (!decoded) {
          res.status(401).json({ success: false, error: 'Authorization required' });
          return;
        }

        if (!hasAdminRole(decoded)) {
          res.status(403).json({ success: false, error: 'Admin access required' });
          return;
        }

        const result = await SetupService.getRegistrationToken();

        if (!result.ok) {
          res.status(404).json({
            success: false,
            error: result.error.message,
          });
          return;
        }

        res.json(result.data);
      }
    )
  );

  app.post(
    '/api/setup/regenerate-token',
    createAsyncRouteHandler(
      'Setup regenerate-token route failed',
      sendJsonInternalError,
      async (req: Request, res: Response): Promise<void> => {
        const decoded = await verifyAccessTokenFromRequest(req);
        if (!decoded) {
          res.status(401).json({ success: false, error: 'Authorization required' });
          return;
        }

        if (!hasAdminRole(decoded)) {
          res.status(403).json({ success: false, error: 'Admin access required' });
          return;
        }

        const result = await SetupService.regenerateToken();

        if (!result.ok) {
          res.status(404).json({
            success: false,
            error: result.error.message,
          });
          return;
        }

        res.json(result.data);
      }
    )
  );

  app.post(
    '/api/setup/validate-token',
    createAsyncRouteHandler(
      'Setup validate-token route failed',
      sendJsonInternalError,
      async (req: Request, res: Response): Promise<void> => {
        const { token } = req.body as { token?: string };
        if (!token || typeof token !== 'string') {
          res.json({ valid: false });
          return;
        }
        const valid = await setupStorage.validateRegistrationToken(token);
        res.json({ valid });
      }
    )
  );
}
