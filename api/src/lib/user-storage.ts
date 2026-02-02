/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * User Storage - PostgreSQL-based user management using Drizzle ORM
 */

import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { eq, sql, count } from 'drizzle-orm';
import { normalize } from '@openpath/shared';
import { db, users } from '../db/index.js';
import type { User, SafeUser } from '../types/index.js';
import type { IUserStorage, CreateUserData, UpdateUserData } from '../types/storage.js';
import { config } from '../config.js';

// =============================================================================
// Types
// =============================================================================

type DBUser = typeof users.$inferSelect;

interface UserStats {
  total: number;
  active: number;
  verified: number;
}

// Extended user type for routes
interface StoredUserResult extends User {
  isActive: boolean;
  emailVerified: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

function toUserType(user: DBUser): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    passwordHash: user.passwordHash ?? undefined,
    googleId: user.googleId ?? undefined,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: user.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

// =============================================================================
// Public API
// =============================================================================

export async function getAllUsers(): Promise<SafeUser[]> {
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isActive: users.isActive,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .orderBy(sql`${users.createdAt} DESC`);

  return result.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    isActive: row.isActive,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  }));
}

export async function getUserById(id: string): Promise<User | null> {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

  return result[0] ? toUserType(result[0]) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = LOWER(${email})`)
    .limit(1);

  return result[0] ? toUserType(result[0]) : null;
}

export async function emailExists(email: string): Promise<boolean> {
  const result = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`LOWER(${users.email}) = LOWER(${email})`)
    .limit(1);

  return result.length > 0;
}

export async function getUserByGoogleId(googleId: string): Promise<User | null> {
  const result = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);

  return result[0] ? toUserType(result[0]) : null;
}

export interface CreateGoogleUserData {
  email: string;
  name: string;
  googleId: string;
}

export async function createGoogleUser(userData: CreateGoogleUserData): Promise<SafeUser> {
  const id = `user_${uuidv4().slice(0, 8)}`;

  const [result] = await db
    .insert(users)
    .values({
      id,
      email: normalize.email(userData.email),
      name: userData.name.trim(),
      googleId: userData.googleId,
      emailVerified: true,
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });

  if (!result) {
    throw new Error('Failed to create Google user');
  }

  return {
    id: result.id,
    email: result.email,
    name: result.name,
    isActive: true,
    emailVerified: true,
    createdAt: result.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: result.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function linkGoogleId(userId: string, googleId: string): Promise<boolean> {
  const result = await db
    .update(users)
    .set({ googleId, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return (result.rowCount ?? 0) > 0;
}

/**
 * Create a new user with hashed password.
 *
 * @param userData - User creation data (email, name, password)
 * @returns Promise resolving to the created user (without password hash)
 * @throws {Error} If database insertion fails
 */
export async function createUser(userData: CreateUserData): Promise<SafeUser> {
  const passwordHash = await bcrypt.hash(userData.password, config.bcryptRounds);
  const id = `user_${uuidv4().slice(0, 8)}`;

  const [result] = await db
    .insert(users)
    .values({
      id,
      email: normalize.email(userData.email),
      name: userData.name.trim(),
      passwordHash,
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });

  if (!result) {
    throw new Error('Failed to create user');
  }

  return {
    id: result.id,
    email: result.email,
    name: result.name,
    isActive: true,
    createdAt: result.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: result.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function updateUser(id: string, updates: UpdateUserData): Promise<SafeUser | null> {
  const updateValues: Partial<typeof users.$inferInsert> = {};

  if (updates.email !== undefined) {
    updateValues.email = normalize.email(updates.email);
  }
  if (updates.name !== undefined) {
    updateValues.name = updates.name.trim();
  }
  if (updates.password !== undefined) {
    updateValues.passwordHash = await bcrypt.hash(updates.password, config.bcryptRounds);
  }

  if (Object.keys(updateValues).length === 0) {
    // No updates, just return existing user
    const existing = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return existing[0]
      ? {
          id: existing[0].id,
          email: existing[0].email,
          name: existing[0].name,
          isActive: true,
          createdAt: existing[0].createdAt?.toISOString() ?? new Date().toISOString(),
          updatedAt: existing[0].updatedAt?.toISOString() ?? new Date().toISOString(),
        }
      : null;
  }

  const [result] = await db.update(users).set(updateValues).where(eq(users.id, id)).returning({
    id: users.id,
    email: users.email,
    name: users.name,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  });

  return result
    ? {
        id: result.id,
        email: result.email,
        name: result.name,
        isActive: true,
        createdAt: result.createdAt?.toISOString() ?? new Date().toISOString(),
        updatedAt: result.updatedAt?.toISOString() ?? new Date().toISOString(),
      }
    : null;
}

export async function updateLastLogin(id: string): Promise<void> {
  await db.update(users).set({ updatedAt: new Date() }).where(eq(users.id, id));
}

export async function deleteUser(id: string): Promise<boolean> {
  const result = await db.delete(users).where(eq(users.id, id));

  return (result.rowCount ?? 0) > 0;
}

export async function verifyEmail(id: string): Promise<boolean> {
  const result = await db.update(users).set({ updatedAt: new Date() }).where(eq(users.id, id));

  return (result.rowCount ?? 0) > 0;
}

/**
 * Verify a user's password.
 *
 * @param user - User object containing password hash
 * @param password - Plaintext password to check
 * @returns Promise resolving to true if password matches, false otherwise
 */
export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return await bcrypt.compare(password, user.passwordHash ?? '');
}

export async function verifyPasswordByEmail(
  email: string,
  password: string
): Promise<StoredUserResult | null> {
  const result = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = LOWER(${email})`)
    .limit(1);

  const user = result[0];
  if (!user?.passwordHash) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    passwordHash: user.passwordHash,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: user.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function getStats(): Promise<UserStats> {
  const [totalRes] = await db.select({ count: count() }).from(users);
  const [activeRes] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.isActive, true));
  const [verifiedRes] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.emailVerified, true));

  return {
    total: totalRes?.count ?? 0,
    active: activeRes?.count ?? 0,
    verified: verifiedRes?.count ?? 0,
  };
}

// =============================================================================
// Storage Instance
// =============================================================================

export const userStorage: IUserStorage = {
  getAllUsers,
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  deleteUser,
  verifyPassword,
};

export default userStorage;
