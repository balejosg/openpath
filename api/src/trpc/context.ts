import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import * as auth from '../lib/auth.js';
import type { JWTPayload } from '../lib/auth.js';
import * as roleStorage from '../lib/role-storage.js';
import { logger } from '../lib/logger.js';

export interface Context {
  user: JWTPayload | null;
  req: CreateExpressContextOptions['req'];
  res: CreateExpressContextOptions['res'];
}

function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;

  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey === name) {
      const value = rawValue.join('=');
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }

  return null;
}

export async function createContext({ req, res }: CreateExpressContextOptions): Promise<Context> {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') === true ? authHeader.slice(7) : null;

  const cookieName = process.env.OPENPATH_ACCESS_TOKEN_COOKIE_NAME;
  const cookieToken = cookieName ? parseCookieValue(req.headers.cookie, cookieName) : null;

  let user: JWTPayload | null = null;

  const candidates = [bearerToken, cookieToken].filter((t): t is string => typeof t === 'string');

  for (const token of candidates) {
    user = await auth.verifyAccessToken(token);
    if (user) break;

    // Fallback to legacy admin token
    const adminToken = process.env.ADMIN_TOKEN;
    if (adminToken && adminToken === token) {
      logger.info('Legacy admin token used for request context');
      user = auth.createLegacyAdminPayload() as unknown as JWTPayload;
      break;
    }
  }

  // Sync role/group assignments from DB so group permissions don't depend on stale JWT claims.
  // Skip legacy admin payload (used by ADMIN_TOKEN tests).
  if (
    user &&
    !(typeof (user as unknown as { isLegacy?: unknown }).isLegacy === 'boolean'
      ? (user as unknown as { isLegacy?: boolean }).isLegacy
      : false)
  ) {
    try {
      const dbRoles = await roleStorage.getUserRoles(user.sub);
      if (dbRoles.length > 0) {
        user = {
          ...user,
          roles: dbRoles.map((r) => ({
            role: r.role as 'admin' | 'teacher' | 'student',
            groupIds: r.groupIds ?? [],
          })),
        } as JWTPayload;
      }
    } catch (err) {
      logger.warn('Failed to sync user roles from DB', {
        userId: user.sub,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { user, req, res };
}
