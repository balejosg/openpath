/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Dashboard Server
 *
 * Provides a REST API wrapper around tRPC calls to the OpenPath API.
 * Authentication is handled via JWT tokens stored in HTTP-only cookies.
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import * as api from './api-client.js';
import type { ApiClient } from './api-client.js';
import { logger } from './lib/logger.js';
import { getTRPCErrorMessage, getTRPCErrorStatus, isTRPCError } from './trpc.js';

// =============================================================================
// Express Types Extension
// =============================================================================

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiClient?: ApiClient;
      accessToken?: string;
    }
  }
}

// =============================================================================
// App Setup
// =============================================================================

const app = express();
const PORT = process.env.PORT ?? 3001;
const COOKIE_SECRET = process.env.COOKIE_SECRET ?? 'dashboard-dev-secret';
const COOKIE_SECURE = process.env.NODE_ENV === 'production';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(COOKIE_SECRET));

// =============================================================================
// Authentication Middleware
// =============================================================================

/**
 * Extract JWT token from cookie or Authorization header.
 */
function getToken(req: Request): string | null {
  // Option 1: From HTTP-only cookie
  const cookieToken = req.signedCookies.access_token as string | undefined;
  if (cookieToken) {
    return cookieToken;
  }

  // Option 2: From Authorization header (API clients)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

/**
 * Require authentication for protected routes.
 */
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  // Attach token and API client to request
  req.accessToken = token;
  req.apiClient = api.createApiClient(token);
  next();
}

/**
 * Get API client from request - throws if not authenticated.
 */
function getApiClient(req: Request): ApiClient {
  if (!req.apiClient) {
    throw new Error('API client not initialized - requireAuth middleware must be used');
  }
  return req.apiClient;
}

/**
 * Get access token from request - throws if not authenticated.
 */
function getAccessToken(req: Request): string {
  if (!req.accessToken) {
    throw new Error('Access token not set - requireAuth middleware must be used');
  }
  return req.accessToken;
}

/**
 * Async route wrapper for error handling.
 */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

// =============================================================================
// Auth Routes
// =============================================================================

app.post(
  '/api/auth/login',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body as Record<string, unknown>;
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    const result = await api.login(username, password);

    if (result.success && result.accessToken && result.refreshToken) {
      // Set tokens in HTTP-only cookies
      res.cookie('access_token', result.accessToken, {
        httpOnly: true,
        secure: COOKIE_SECURE,
        signed: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict',
      });
      res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: COOKIE_SECURE,
        signed: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: 'strict',
      });

      res.json({ success: true, user: result.user });
    } else {
      res.status(401).json({ error: result.error ?? 'Credenciales inválidas' });
    }
  })
);

app.post(
  '/api/auth/logout',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const accessToken = req.signedCookies.access_token as string | undefined;
    const refreshToken = req.signedCookies.refresh_token as string | undefined;

    if (accessToken && refreshToken) {
      await api.logout(accessToken, refreshToken);
    }

    // Clear cookies
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    res.json({ success: true });
  })
);

app.get('/api/auth/check', (req: Request, res: Response): void => {
  const token = getToken(req);
  if (token) {
    // Token exists, assume authenticated (API will validate on actual requests)
    res.json({ authenticated: true });
  } else {
    res.json({ authenticated: false });
  }
});

app.post(
  '/api/auth/change-password',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { currentPassword, newPassword } = req.body as Record<string, unknown>;
    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      newPassword.length < 8
    ) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      return;
    }

    const result = await api.changePassword(getAccessToken(req), currentPassword, newPassword);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  })
);

// =============================================================================
// Stats Routes
// =============================================================================

app.get(
  '/api/stats',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const stats = await getApiClient(req).getStats();
    res.json(stats);
  })
);

// =============================================================================
// System Routes
// =============================================================================

app.get(
  '/api/system/status',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const status = await getApiClient(req).getSystemStatus();
    res.json(status);
  })
);

app.post(
  '/api/system/toggle',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { enable } = req.body as Record<string, unknown>;
    const status = await getApiClient(req).toggleSystemStatus(!!enable);
    res.json({ success: true, ...status });
  })
);

// =============================================================================
// Groups Routes
// =============================================================================

app.get(
  '/api/groups',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const groups = await getApiClient(req).getAllGroups();
    res.json(groups);
  })
);

app.post(
  '/api/groups',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, displayName } = req.body as Record<string, unknown>;
    if (!name || !displayName || typeof name !== 'string' || typeof displayName !== 'string') {
      res.status(400).json({ error: 'Nombre requerido' });
      return;
    }

    try {
      const result = await getApiClient(req).createGroup(name, displayName);
      res.json({ success: true, id: result.id, name: result.name });
    } catch (err: unknown) {
      if (isTRPCError(err) && err.data?.code === 'CONFLICT') {
        res.status(400).json({ error: 'Ya existe un grupo con ese nombre' });
        return;
      }
      throw err;
    }
  })
);

app.get(
  '/api/groups/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID requerido' });
      return;
    }

    const group = await getApiClient(req).getGroupById(id);
    if (!group) {
      res.status(404).json({ error: 'Grupo no encontrado' });
      return;
    }
    res.json(group);
  })
);

app.put(
  '/api/groups/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID requerido' });
      return;
    }

    const { displayName, enabled } = req.body as Record<string, unknown>;
    if (typeof displayName !== 'string') {
      res.status(400).json({ error: 'Invalid details' });
      return;
    }

    await getApiClient(req).updateGroup(id, displayName, !!enabled);
    res.json({ success: true });
  })
);

app.delete(
  '/api/groups/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID requerido' });
      return;
    }

    await getApiClient(req).deleteGroup(id);
    res.json({ success: true });
  })
);

// =============================================================================
// Rules Routes
// =============================================================================

app.get(
  '/api/groups/:groupId/rules',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const groupId = req.params.groupId;
    if (!groupId) {
      res.status(400).json({ error: 'Group ID requerido' });
      return;
    }

    const { type } = req.query;
    const rules = await getApiClient(req).getRulesByGroup(
      groupId,
      (type as api.RuleType | undefined) ?? undefined
    );
    res.json(rules);
  })
);

app.post(
  '/api/groups/:groupId/rules',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const groupId = req.params.groupId;
    if (!groupId) {
      res.status(400).json({ error: 'Group ID requerido' });
      return;
    }

    const { type, value, comment } = req.body as Record<string, unknown>;
    if (!type || !value || typeof type !== 'string' || typeof value !== 'string') {
      res.status(400).json({ error: 'Tipo y valor requeridos' });
      return;
    }

    try {
      const result = await getApiClient(req).createRule(
        groupId,
        type as api.RuleType,
        value,
        comment as string | undefined
      );
      res.json({ success: true, id: result.id });
    } catch (err: unknown) {
      if (isTRPCError(err) && err.data?.code === 'CONFLICT') {
        res.status(400).json({ error: 'La regla ya existe' });
        return;
      }
      throw err;
    }
  })
);

app.post(
  '/api/groups/:groupId/rules/bulk',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const groupId = req.params.groupId;
    if (!groupId) {
      res.status(400).json({ error: 'Group ID requerido' });
      return;
    }

    const { type, values } = req.body as Record<string, unknown>;
    if (!type || !values || !Array.isArray(values)) {
      res.status(400).json({ error: 'Tipo y valores requeridos' });
      return;
    }

    const count = await getApiClient(req).bulkCreateRules(
      groupId,
      type as api.RuleType,
      values as string[]
    );
    res.json({ success: true, count });
  })
);

app.delete(
  '/api/rules/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'ID requerido' });
      return;
    }

    await getApiClient(req).deleteRule(id);
    res.json({ success: true });
  })
);

// =============================================================================
// Public Export (redirects to API)
// =============================================================================

app.get('/export/:name.txt', (req: Request, res: Response): void => {
  const name = req.params.name;
  if (!name) {
    res.status(400).send('Nombre requerido');
    return;
  }

  // Redirect to API export endpoint
  res.redirect(api.getExportUrl(name));
});

// =============================================================================
// 404 Handler
// =============================================================================

app.use((_req: Request, res: Response): void => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// =============================================================================
// Error Handler
// =============================================================================

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (isTRPCError(err)) {
    const status = getTRPCErrorStatus(err);
    const message = getTRPCErrorMessage(err);
    logger.error('tRPC error', { code: err.data?.code, message });
    res.status(status).json({ error: message });
    return;
  }

  logger.error('Unhandled error', { error: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: 'Error interno del servidor' });
});

// =============================================================================
// Startup
// =============================================================================

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`OpenPath Dashboard running on http://localhost:${PORT.toString()}`);
    logger.info(`API URL: ${process.env.API_URL ?? 'http://localhost:3000'}`);
  });
}

export default app;
