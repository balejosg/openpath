/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Token Store - PostgreSQL-backed token blacklist using Drizzle ORM
 */

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import { db, tokens } from '../db/index.js';
import { logger } from './logger.js';
import type { ITokenStore } from '../types/storage.js';

// =============================================================================
// Types
// =============================================================================

interface DecodedTokenBase {
  exp?: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// =============================================================================
// Token Store Implementation
// =============================================================================

export async function blacklistToken(token: string, expiresAt: Date): Promise<void> {
  const decoded = jwt.decode(token) as (DecodedTokenBase & { sub?: string }) | null;
  const userId = decoded?.sub ?? 'unknown';

  const tokenHash = hashToken(token);
  // Use first 32 chars of hash as ID (deterministic and unique enough)
  const id = tokenHash.substring(0, 32);

  logger.debug('Blacklisting token', { userId, tokenId: id });

  await db
    .insert(tokens)
    .values({
      id,
      userId,
      tokenHash,
      expiresAt,
    })
    .onConflictDoNothing();
}

export async function isBlacklisted(token: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const id = tokenHash.substring(0, 32);

  const result = await db.select().from(tokens).where(eq(tokens.id, id)).limit(1);

  if (result.length === 0) {
    return false;
  }

  const tokenRecord = result[0];
  return tokenRecord !== undefined && tokenRecord.expiresAt > new Date();
}

export async function cleanup(): Promise<number> {
  const result = await db.delete(tokens).where(lt(tokens.expiresAt, new Date()));

  return result.rowCount ?? 0;
}

// =============================================================================
// ITokenStore Adapter
// =============================================================================

export const tokenStore: ITokenStore = {
  blacklist: blacklistToken,
  isBlacklisted,
  cleanup,
};

export default tokenStore;

// =============================================================================
// Legacy Compatibility Exports
// =============================================================================

export function getTokenStore(): ITokenStore {
  return tokenStore;
}

export function resetTokenStore(): void {
  // No-op for DB-based store
}
