import jwt from 'jsonwebtoken';

import { getJwtSecret } from './auth-config.js';
import { getTokenStore } from './token-store.js';
import type { JWTPayload, RoleInfo } from '../types/index.js';
import { normalizeUserRoleString } from '@openpath/shared/roles';

const tokenStore = getTokenStore();

function normalizeDecodedRoles(decodedRaw: Record<string, unknown>): RoleInfo[] {
  const rawRoles = decodedRaw.roles;
  const normalized: RoleInfo[] = [];

  if (!Array.isArray(rawRoles)) {
    return normalized;
  }

  for (const raw of rawRoles) {
    if (raw === null || typeof raw !== 'object') continue;
    const rawRole = (raw as { role?: unknown }).role;
    const role = normalizeUserRoleString(rawRole);
    if (!role) continue;

    const rawGroupIds = (raw as { groupIds?: unknown }).groupIds;
    const groupIds = Array.isArray(rawGroupIds)
      ? rawGroupIds.filter((groupId): groupId is string => typeof groupId === 'string')
      : [];

    normalized.push({ role, groupIds });
  }

  return normalized;
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    if (await tokenStore.isBlacklisted(token)) {
      return null;
    }

    const decodedRaw: unknown = jwt.verify(token, getJwtSecret(), {
      issuer: 'openpath-api',
    });

    if (decodedRaw === null || typeof decodedRaw !== 'object') {
      return null;
    }

    const decoded = decodedRaw as JWTPayload;
    if (decoded.type === 'access') {
      decoded.roles = normalizeDecodedRoles(decodedRaw as Record<string, unknown>);
    }

    return decoded;
  } catch {
    return null;
  }
}

export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  const decoded = await verifyToken(token);
  return decoded?.type === 'access' ? decoded : null;
}

export async function verifyRefreshToken(token: string): Promise<JWTPayload | null> {
  const decoded = await verifyToken(token);
  return decoded?.type === 'refresh' ? decoded : null;
}

export async function cleanupBlacklist(): Promise<void> {
  await tokenStore.cleanup();
}

export async function isBlacklisted(token: string): Promise<boolean> {
  return tokenStore.isBlacklisted(token);
}
