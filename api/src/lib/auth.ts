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
import { logger } from './logger.js';
import type { User, JWTPayload, RoleInfo } from '../types/index.js';

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

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && (process.env.JWT_SECRET === undefined || process.env.JWT_SECRET === '')) {
  logger.error('FATAL SECURITY ERROR: JWT_SECRET not set in production', {
    hint: "Generate a secure secret with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"",
    action: 'Set JWT_SECRET environment variable before starting the server',
  });
  process.exit(1);
}

// In development, generate a random secret but warn about token invalidation
let JWT_SECRET: string;
if (process.env.JWT_SECRET !== undefined && process.env.JWT_SECRET !== '') {
  JWT_SECRET = process.env.JWT_SECRET;
} else {
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  logger.warn('JWT_SECRET not set - using random secret', {
    consequence: 'All tokens will be invalidated on server restart',
    action: 'Set JWT_SECRET environment variable for persistent tokens',
  });
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';

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
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'openpath-api',
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
  } as SignOptions);
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokens(user: User, roles: RoleInfo[] = []): TokensResult {
  return {
    accessToken: generateAccessToken(user, roles),
    refreshToken: generateRefreshToken(user),
    expiresIn: JWT_EXPIRES_IN,
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

    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'openpath-api',
    }) as JWTPayload;

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

export { JWT_SECRET, JWT_EXPIRES_IN };
