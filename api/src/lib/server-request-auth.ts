import type { Request, Response } from 'express';

import * as classroomStorage from './classroom-storage.js';
import { verifyAccessToken } from './auth.js';
import { verifyEnrollmentToken } from './enrollment-token.js';
import { hashMachineToken } from './machine-download-token.js';
import { getSessionCookieConfig } from './session-cookies.js';

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

export function isCookieAuthenticatedMutation(req: Request): boolean {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method.toUpperCase())) {
    return false;
  }

  const authorization = req.headers.authorization;
  if (authorization?.startsWith('Bearer ')) {
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

export function getFirstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function verifyAccessTokenFromRequest(
  req: Pick<Request, 'headers'>
): Promise<Awaited<ReturnType<typeof verifyAccessToken>>> {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') === true ? authHeader.slice(7) : null;

  const cookieName = process.env.OPENPATH_ACCESS_TOKEN_COOKIE_NAME;
  const cookieToken = cookieName ? parseCookieValue(req.headers.cookie, cookieName) : null;

  const candidates = [bearerToken, cookieToken].filter((t): t is string => typeof t === 'string');

  for (const token of candidates) {
    const decoded = await verifyAccessToken(token);
    if (decoded) return decoded;
  }

  return null;
}

type MachineByToken = Awaited<ReturnType<typeof classroomStorage.getMachineByDownloadTokenHash>>;
export type AuthenticatedMachine = NonNullable<MachineByToken>;

export async function authenticateMachineToken(
  req: Request,
  res: Response
): Promise<AuthenticatedMachine | null> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ') !== true) {
    res.status(401).json({ success: false, error: 'Authorization header required' });
    return null;
  }

  const machineToken = authHeader.slice(7);
  if (!machineToken) {
    res.status(401).json({ success: false, error: 'Machine token required' });
    return null;
  }

  const tokenHash = hashMachineToken(machineToken);
  const machine = await classroomStorage.getMachineByDownloadTokenHash(tokenHash);
  if (!machine) {
    res.status(403).json({ success: false, error: 'Invalid machine token' });
    return null;
  }

  return machine;
}

export interface AuthenticatedEnrollment {
  classroomId: string;
  classroomName: string;
  enrollmentToken: string;
}

export async function authenticateEnrollmentToken(
  req: Request,
  res: Response
): Promise<AuthenticatedEnrollment | null> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ') !== true) {
    res.status(401).json({ success: false, error: 'Authorization header required' });
    return null;
  }

  const enrollmentToken = authHeader.slice(7);
  if (!enrollmentToken) {
    res.status(401).json({ success: false, error: 'Enrollment token required' });
    return null;
  }

  const payload = verifyEnrollmentToken(enrollmentToken);
  if (!payload) {
    res.status(403).json({ success: false, error: 'Invalid enrollment token' });
    return null;
  }

  const classroom = await classroomStorage.getClassroomById(payload.classroomId);
  if (!classroom) {
    res.status(404).json({ success: false, error: 'Classroom not found' });
    return null;
  }

  return {
    classroomId: classroom.id,
    classroomName: classroom.name,
    enrollmentToken,
  };
}
