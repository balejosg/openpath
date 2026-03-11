/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Authentication Library - JWT management
 * Handles token generation, verification, and refresh
 */

import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';
import { getTokenStore } from './token-store.js';
import { config } from '../config.js';
import type { User, JWTPayload, RoleInfo } from '../types/index.js';
import { normalizeUserRoleString } from '@openpath/shared/roles';

// =============================================================================
// Types
// =============================================================================

export type { JWTPayload, RoleInfo };

export interface TokensResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  tokenType: 'Bearer';
}

interface LegacyAdminPayload {
  sub: string;
  email: string;
  name: string;
  roles: RoleInfo[];
  type: 'access';
  isLegacy: true;
}

// =============================================================================
// SECURITY: JWT Secret Configuration
// =============================================================================

const JWT_SECRET = config.jwtSecret;

const JWT_ACCESS_EXPIRES_IN = config.jwtAccessExpiry;
const JWT_REFRESH_EXPIRES_IN = config.jwtRefreshExpiry;

// Use object literal directly in jwt.sign() to avoid exactOptionalPropertyTypes issues

// Token store (supports both memory and Redis backends)
const tokenStore = getTokenStore();

// =============================================================================
// Token Generation
// =============================================================================

/**
 * Generate access token for user
 */
export function generateAccessToken(user: User, roles: RoleInfo[] = []): string {
  const payload: JWTPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    roles: roles.map((r) => ({
      role: r.role,
      groupIds: r.groupIds,
    })),
    type: 'access',
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES_IN,
    issuer: 'openpath-api',
    // Prevent identical token strings when multiple logins happen in the same second.
    // This avoids cross-test invalidation when tokens are blacklisted on logout.
    jwtid: crypto.randomUUID(),
  } as SignOptions);
}

/**
 * Generate refresh token for user
 */
export function generateRefreshToken(user: User): string {
  const payload = {
    sub: user.id,
    type: 'refresh',
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
    issuer: 'openpath-api',
    jwtid: crypto.randomUUID(),
  } as SignOptions);
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokens(user: User, roles: RoleInfo[] = []): TokensResult {
  return {
    accessToken: generateAccessToken(user, roles),
    refreshToken: generateRefreshToken(user),
    expiresIn: JWT_ACCESS_EXPIRES_IN,
    tokenType: 'Bearer',
  };
}

// =============================================================================
// Token Verification
// =============================================================================

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    // Check blacklist (async for Redis support)
    const isBlacklistedToken = await tokenStore.isBlacklisted(token);
    if (isBlacklistedToken) {
      return null;
    }

    const decodedRaw: unknown = jwt.verify(token, JWT_SECRET, {
      issuer: 'openpath-api',
    });

    if (decodedRaw === null || typeof decodedRaw !== 'object') {
      return null;
    }

    const decoded = decodedRaw as JWTPayload;

    if (decoded.type === 'access') {
      const rawRoles = (decodedRaw as { roles?: unknown }).roles;
      const normalized: RoleInfo[] = [];

      if (Array.isArray(rawRoles)) {
        for (const raw of rawRoles) {
          if (raw === null || typeof raw !== 'object') continue;
          const rawRole = (raw as { role?: unknown }).role;
          const role = normalizeUserRoleString(rawRole);
          if (!role) continue;

          const rawGroupIds = (raw as { groupIds?: unknown }).groupIds;
          const groupIds = Array.isArray(rawGroupIds)
            ? rawGroupIds.filter((g): g is string => typeof g === 'string')
            : [];

          normalized.push({ role, groupIds });
        }
      }

      decoded.roles = normalized;
    }

    return decoded;
  } catch {
    // SECURITY: Silent fail on token verification - don't log detailed errors
    // to prevent timing attacks and information disclosure
    return null;
  }
}

/**
 * Verify access token
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  const decoded = await verifyToken(token);
  if (decoded?.type === 'access') {
    return decoded;
  }
  return null;
}

/**
 * Verify refresh token
 */
export async function verifyRefreshToken(token: string): Promise<JWTPayload | null> {
  const decoded = await verifyToken(token);
  if (decoded?.type === 'refresh') {
    return decoded;
  }
  return null;
}

// =============================================================================
// Token Blacklist (for logout/revocation)
// =============================================================================

/**
 * Blacklist a token (logout)
 */
export async function blacklistToken(token: string): Promise<boolean> {
  const decoded = await verifyToken(token);
  const expiresAt = decoded?.exp
    ? new Date(decoded.exp * 1000)
    : new Date(Date.now() + 24 * 60 * 60 * 1000);
  await tokenStore.blacklist(token, expiresAt);
  return true;
}

/**
 * Remove expired tokens from blacklist
 */
export async function cleanupBlacklist(): Promise<void> {
  await tokenStore.cleanup();
}

/**
 * Check if token is blacklisted
 */
export async function isBlacklisted(token: string): Promise<boolean> {
  return tokenStore.isBlacklisted(token);
}

// =============================================================================
// Authorization Helpers
// =============================================================================

export interface DecodedWithRoles {
  sub: string;
  email?: string;
  name?: string;
  roles?: RoleInfo[];
}

/**
 * Check if decoded token has admin role
 */
export function isAdminToken(decoded: DecodedWithRoles | null | undefined): boolean {
  if (!decoded?.roles) return false;
  return decoded.roles.some((r) => r.role === 'admin');
}

/**
 * Check if decoded token has teacher role for given group
 */
export function canApproveGroup(
  decoded: DecodedWithRoles | null | undefined,
  groupId: string
): boolean {
  if (!decoded?.roles) return false;

  // Admin can approve any group
  if (isAdminToken(decoded)) return true;

  // Teacher can approve their groups
  return decoded.roles.some((r) => r.role === 'teacher' && r.groupIds.includes(groupId));
}

/**
 * Get all groups the user can approve for
 */
export function getApprovalGroups(decoded: DecodedWithRoles | null | undefined): string[] | 'all' {
  if (!decoded?.roles) return [];

  if (isAdminToken(decoded)) return 'all';

  const groups = new Set<string>();
  decoded.roles
    .filter((r) => r.role === 'teacher')
    .forEach((r) => {
      r.groupIds.forEach((g: string) => groups.add(g));
    });

  return Array.from(groups);
}

// =============================================================================
// Legacy Token Support (for backward compatibility with ADMIN_TOKEN)
// =============================================================================

/**
 * Create a pseudo-decoded token for legacy admin token
 */
export function createLegacyAdminPayload(): LegacyAdminPayload {
  return {
    sub: 'legacy_admin',
    email: 'admin@system',
    name: 'Legacy Admin',
    roles: [{ role: 'admin', groupIds: [] }],
    type: 'access',
    isLegacy: true,
  };
}

// =============================================================================
// Exports
// =============================================================================

export { JWT_SECRET, JWT_ACCESS_EXPIRES_IN as JWT_EXPIRES_IN };
