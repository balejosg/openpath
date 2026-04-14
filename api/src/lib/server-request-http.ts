import type { Request } from 'express';

import { verifyAccessToken } from './auth.js';
import { getSessionCookieConfig } from './session-cookies.js';

export function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
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

function normalizeOrigin(value: string | undefined): string | null {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getRequestOrigin(req: Request): string {
  return `${req.protocol}://${req.get('host') ?? 'localhost'}`;
}

export function getFirstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function getBearerTokenValue(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function isCookieAuthenticatedMutation(req: Request): boolean {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method.toUpperCase())) {
    return false;
  }

  if (req.headers.authorization?.startsWith('Bearer ')) {
    return false;
  }

  const cookieConfig = getSessionCookieConfig();
  if (!cookieConfig) {
    return false;
  }

  return Boolean(
    parseCookieValue(req.headers.cookie, cookieConfig.accessCookieName) ??
    parseCookieValue(req.headers.cookie, cookieConfig.refreshCookieName)
  );
}

export function isTrustedCsrfOrigin(req: Request, allowedOrigins: string[]): boolean {
  const candidateOrigin =
    normalizeOrigin(req.get('origin')) ?? normalizeOrigin(req.get('referer')) ?? null;

  if (!candidateOrigin) {
    return false;
  }

  return candidateOrigin === getRequestOrigin(req) || allowedOrigins.includes(candidateOrigin);
}

export async function verifyAccessTokenFromRequest(
  req: Pick<Request, 'headers'>
): Promise<Awaited<ReturnType<typeof verifyAccessToken>>> {
  const bearerToken = getBearerTokenValue(req.headers.authorization);

  const cookieName = process.env.OPENPATH_ACCESS_TOKEN_COOKIE_NAME;
  const cookieToken = cookieName ? parseCookieValue(req.headers.cookie, cookieName) : null;

  const candidates = [bearerToken, cookieToken].filter(
    (token): token is string => typeof token === 'string'
  );
  for (const token of candidates) {
    const decoded = await verifyAccessToken(token);
    if (decoded) {
      return decoded;
    }
  }

  return null;
}
