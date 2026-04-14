/**
 * UserService - Business logic for user management
 */

import * as userStorage from '../lib/user-storage.js';
import * as roleStorage from '../lib/role-storage.js';
import { withTransaction } from '../db/index.js';
import type { User, SafeUser, UserRole, Role } from '../types/index.js';
import type { UpdateUserData, CreateUserData } from '../types/storage.js';
import { getErrorMessage } from '@openpath/shared';
import { normalizeUserRoleString } from '@openpath/shared/roles';

// =============================================================================
// Types
// =============================================================================

export type UserServiceError =
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'CONFLICT'; message: string }
  | { code: 'FORBIDDEN'; message: string }
  | { code: 'BAD_REQUEST'; message: string };

export type UserResult<T> = { ok: true; data: T } | { ok: false; error: UserServiceError };

export interface UserWithRoles extends SafeUser {
  roles: Role[];
}

// =============================================================================
// Helper Functions
// =============================================================================

interface DBRole {
  id: string;
  userId: string;
  role: string;
  groupIds: string[] | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  createdBy: string | null;
  expiresAt: Date | null;
}

function mapDBRoleToRole(r: DBRole): Role {
  const role = normalizeUserRoleString(r.role);
  return {
    id: r.id,
    userId: r.userId,
    role: role ?? 'student',
    groupIds: r.groupIds ?? [],
    createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
    expiresAt: r.expiresAt?.toISOString() ?? null,
  };
}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * List all users with their roles
 */
export async function listUsers(): Promise<UserWithRoles[]> {
  const users = await userStorage.getAllUsers();
  const result: UserWithRoles[] = [];

  for (const user of users) {
    const roles = await roleStorage.getRolesByUser(user.id);
    result.push({
      ...user,
      roles,
    });
  }

  return result;
}

/**
 * Get a specific user with roles
 */
export async function getUser(id: string): Promise<UserResult<UserWithRoles>> {
  const user = await userStorage.getUserById(id);
  if (!user) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
  }

  const roles = await roleStorage.getRolesByUser(user.id);
  const safeUser: SafeUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return {
    ok: true,
    data: {
      ...safeUser,
      roles,
    },
  };
}

/**
 * Update user details
 */
export async function updateUser(id: string, input: UpdateUserData): Promise<UserResult<SafeUser>> {
  const user = await userStorage.getUserById(id);
  if (!user) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
  }

  try {
    const updated = await userStorage.updateUser(id, input);
    if (!updated) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'User not found after update' } };
    }
    return { ok: true, data: updated };
  } catch (error) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: getErrorMessage(error) },
    };
  }
}

/**
 * Delete a user and their roles
 */
export async function deleteUser(id: string): Promise<UserResult<{ success: boolean }>> {
  const user = await userStorage.getUserById(id);
  if (!user) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
  }

  await withTransaction(async (tx) => {
    await roleStorage.revokeAllUserRoles(id, undefined, tx);
    await userStorage.deleteUser(id, tx);
  });

  return { ok: true, data: { success: true } };
}

/**
 * Assign a role to a user
 */
export async function assignRole(
  userId: string,
  role: UserRole,
  groupIds: string[]
): Promise<UserResult<Role>> {
  const user = await userStorage.getUserById(userId);
  if (!user) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
  }

  try {
    const assignedRole = await roleStorage.assignRole({
      userId,
      role,
      groupIds,
    });
    return { ok: true, data: mapDBRoleToRole(assignedRole) };
  } catch (error) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: getErrorMessage(error) },
    };
  }
}

export async function createUserWithRole(
  input: CreateUserData,
  role?: UserRole,
  groupIds: string[] = []
): Promise<UserResult<{ user: SafeUser }>> {
  try {
    const user = await withTransaction(async (tx) => {
      const createdUser = await userStorage.createUser(input, { emailVerified: true }, tx);

      if (role) {
        await roleStorage.assignRole(
          {
            userId: createdUser.id,
            role,
            groupIds,
          },
          tx
        );
      }

      return createdUser;
    });

    return { ok: true, data: { user } };
  } catch (error) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: getErrorMessage(error) },
    };
  }
}

export async function createManagedUser(
  input: CreateUserData,
  role?: UserRole,
  groupIds: string[] = []
): Promise<UserResult<UserWithRoles>> {
  const existing = await userStorage.getUserByEmail(input.email);
  if (existing) {
    return { ok: false, error: { code: 'CONFLICT', message: 'Email exists' } };
  }

  const created = await createUserWithRole(input, role, groupIds);
  if (!created.ok) {
    return created;
  }

  return await getUser(created.data.user.id);
}

export async function updateManagedUser(
  id: string,
  input: UpdateUserData
): Promise<UserResult<UserWithRoles>> {
  const updated = await updateUser(id, input);
  if (!updated.ok) {
    return updated;
  }

  return await getUser(id);
}

export async function deleteManagedUser(
  actorUserId: string,
  targetUserId: string
): Promise<UserResult<{ success: boolean }>> {
  if (actorUserId === targetUserId) {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'Cannot delete yourself' } };
  }

  return await deleteUser(targetUserId);
}

/**
 * Revoke a specific role
 */
export async function revokeRole(roleId: string): Promise<UserResult<{ success: boolean }>> {
  const role = await roleStorage.getRoleById(roleId);
  if (!role) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Role not found' } };
  }

  await roleStorage.revokeRole(roleId);
  return { ok: true, data: { success: true } };
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  return await userStorage.getUserByEmail(email);
}

export async function listTeachers(): Promise<roleStorage.TeacherInfo[]> {
  return await roleStorage.getAllTeachers();
}

export async function ensureTeacherRoleGroupAccess(input: {
  userId: string;
  groupId: string;
  createdBy: string;
}): Promise<void> {
  const existingRoles = await roleStorage.getUserRoles(input.userId);
  const teacherRole = existingRoles.find((roleInfo) => roleInfo.role === 'teacher');

  if (!teacherRole) {
    await roleStorage.assignRole({
      userId: input.userId,
      role: 'teacher',
      groupIds: [input.groupId],
      createdBy: input.createdBy,
    });
    return;
  }

  const currentGroups = Array.isArray(teacherRole.groupIds) ? teacherRole.groupIds : [];
  if (currentGroups.includes(input.groupId)) {
    return;
  }

  await roleStorage.addGroupsToRole(teacherRole.id, [input.groupId]);
}

/**
 * Register a new user
 */
export async function register(input: CreateUserData): Promise<UserResult<{ user: SafeUser }>> {
  try {
    const user = await userStorage.createUser(input, { emailVerified: true });
    return { ok: true, data: { user } };
  } catch (error) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: getErrorMessage(error) },
    };
  }
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  listUsers,
  getUser,
  getUserByEmail,
  createManagedUser,
  updateManagedUser,
  deleteManagedUser,
  register,
  createUserWithRole,
  updateUser,
  deleteUser,
  assignRole,
  revokeRole,
  listTeachers,
  ensureTeacherRoleGroupAccess,
};
