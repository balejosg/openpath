/**
 * Reset Token Storage - Logic for managing password reset tokens
 */

import { v4 as uuidv4 } from 'uuid';
import { eq, and, gt } from 'drizzle-orm';
import { db, passwordResetTokens } from '../db/index.js';
import bcrypt from 'bcrypt';
import { config } from '../config.js';

export async function createResetToken(userId: string): Promise<string> {
  const token = uuidv4().replace(/-/g, '').slice(0, 12); // Short, human-readable-ish token
  const tokenHash = await bcrypt.hash(token, config.bcryptRounds);
  const id = `reset_${uuidv4().slice(0, 8)}`;

  // Tokens expire in 1 hour
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1);

  await db.insert(passwordResetTokens).values({
    id,
    userId,
    tokenHash,
    expiresAt,
  });

  return token;
}

export async function verifyToken(userId: string, token: string): Promise<boolean> {
  const results = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(eq(passwordResetTokens.userId, userId), gt(passwordResetTokens.expiresAt, new Date()))
    );

  for (const row of results) {
    if (await bcrypt.compare(token, row.tokenHash)) {
      // Delete all tokens for this user once verified (or just this one)
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
      return true;
    }
  }

  return false;
}

export async function deleteUserTokens(userId: string): Promise<void> {
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
}
