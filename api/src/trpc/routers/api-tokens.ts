/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * API Tokens Router - User-generated API keys for programmatic access
 */

import { z } from 'zod';
import crypto from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { eq, and, isNull } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { db } from '../../db/index.js';
import { apiTokens } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';

/**
 * Hash a token for secure storage
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a secure random token with prefix
 */
function generateToken(): { token: string; lastFour: string } {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const token = `op_${rawToken}`;
  const lastFour = rawToken.slice(-4);
  return { token, lastFour };
}

/**
 * Generate a prefixed ID
 */
function generateId(): string {
  return `tok_${crypto.randomUUID().slice(0, 8)}`;
}

// Input schemas
const CreateTokenSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

const RevokeTokenSchema = z.object({
  id: z.string().min(1),
});

export const apiTokensRouter = router({
  /**
   * List all active tokens for the current user
   * Returns masked tokens (only last 4 chars visible)
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.sub;

    const tokens = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        lastFour: apiTokens.lastFour,
        lastUsedAt: apiTokens.lastUsedAt,
        expiresAt: apiTokens.expiresAt,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)));

    return tokens.map((t) => ({
      id: t.id,
      name: t.name,
      maskedToken: `op_${'•'.repeat(39)}${t.lastFour}`,
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      createdAt: t.createdAt?.toISOString() ?? null,
      isExpired: t.expiresAt ? new Date(t.expiresAt) < new Date() : false,
    }));
  }),

  /**
   * Create a new API token
   * Returns the full token ONCE - it cannot be retrieved again
   */
  create: protectedProcedure.input(CreateTokenSchema).mutation(async ({ input, ctx }) => {
    const userId = ctx.user.sub;
    const { token, lastFour } = generateToken();
    const tokenHash = hashToken(token);
    const id = generateId();

    // Calculate expiration if specified
    let expiresAt: Date | null = null;
    if (input.expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);
    }

    try {
      await db.insert(apiTokens).values({
        id,
        userId,
        name: input.name,
        tokenHash,
        lastFour,
        expiresAt,
      });

      logger.info('API token created', { userId, tokenId: id, name: input.name });

      return {
        id,
        name: input.name,
        token, // Only returned once!
        expiresAt: expiresAt?.toISOString() ?? null,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to create API token', { userId, error });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create API token',
      });
    }
  }),

  /**
   * Revoke (delete) an API token
   * Soft delete - sets revokedAt timestamp
   */
  revoke: protectedProcedure.input(RevokeTokenSchema).mutation(async ({ input, ctx }) => {
    const userId = ctx.user.sub;

    // Verify ownership and existence
    const existing = await db
      .select({ id: apiTokens.id })
      .from(apiTokens)
      .where(
        and(eq(apiTokens.id, input.id), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt))
      )
      .limit(1);

    if (existing.length === 0) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Token not found or already revoked',
      });
    }

    await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, input.id));

    logger.info('API token revoked', { userId, tokenId: input.id });

    return { success: true, revokedAt: new Date().toISOString() };
  }),

  /**
   * Regenerate a token (revoke old, create new with same name)
   */
  regenerate: protectedProcedure.input(RevokeTokenSchema).mutation(async ({ input, ctx }) => {
    const userId = ctx.user.sub;

    // Find existing token
    const existing = await db
      .select({ id: apiTokens.id, name: apiTokens.name, expiresAt: apiTokens.expiresAt })
      .from(apiTokens)
      .where(
        and(eq(apiTokens.id, input.id), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt))
      )
      .limit(1);

    const oldToken = existing[0];
    if (!oldToken) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Token not found or already revoked',
      });
    }

    // Revoke old token
    await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, input.id));

    // Create new token with same name
    const { token, lastFour } = generateToken();
    const tokenHash = hashToken(token);
    const newId = generateId();

    await db.insert(apiTokens).values({
      id: newId,
      userId,
      name: oldToken.name,
      tokenHash,
      lastFour,
      expiresAt: oldToken.expiresAt,
    });

    logger.info('API token regenerated', { userId, oldTokenId: input.id, newTokenId: newId });

    return {
      id: newId,
      name: oldToken.name,
      token, // Only returned once!
      expiresAt: oldToken.expiresAt?.toISOString() ?? null,
      createdAt: new Date().toISOString(),
    };
  }),
});
