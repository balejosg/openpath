import type { Express, Request, Response } from 'express';

import * as setupStorage from '../lib/setup-storage.js';
import { verifyAccessTokenFromRequest } from '../lib/server-request-auth.js';
import SetupService from '../services/setup.service.js';

export function registerSetupRoutes(app: Express): void {
  app.get('/api/setup/status', (_req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      const status = await SetupService.getStatus();
      res.json(status);
    })();
  });

  app.post('/api/setup/first-admin', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
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
    })();
  });

  app.get('/api/setup/registration-token', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      const decoded = await verifyAccessTokenFromRequest(req);
      if (!decoded) {
        res.status(401).json({ success: false, error: 'Authorization required' });
        return;
      }

      const roles = decoded.roles.map((r) => r.role);
      if (!roles.includes('admin')) {
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
    })();
  });

  app.post('/api/setup/regenerate-token', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      const decoded = await verifyAccessTokenFromRequest(req);
      if (!decoded) {
        res.status(401).json({ success: false, error: 'Authorization required' });
        return;
      }

      const roles = decoded.roles.map((r) => r.role);
      if (!roles.includes('admin')) {
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
    })();
  });

  app.post('/api/setup/validate-token', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      const { token } = req.body as { token?: string };
      if (!token || typeof token !== 'string') {
        res.json({ valid: false });
        return;
      }
      const valid = await setupStorage.validateRegistrationToken(token);
      res.json({ valid });
    })();
  });
}
