/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Role Storage - PostgreSQL-based role management using Drizzle ORM
 */

import { v4 as uuidv4 } from 'uuid';
import { eq, sql, and, count } from 'drizzle-orm';
import { db, roles } from '../db/index.js';
import { logger } from './logger.js';
import type { UserRole } from '../types/index.js';
import type { IRoleStorage, AssignRoleData, Role } from '../types/storage.js';

// =============================================================================
// Types
// =============================================================================

type DBRole = typeof roles.$inferSelect;

interface RoleStats {
  total: number;
  active: number;
  admins: number;
  teachers: number;
  students: number;
}

export interface TeacherInfo {
  userId: string;
  groupIds: string[];
  createdAt: string;
  createdBy: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

function toRoleType(db: DBRole): Role {
  return {
    id: db.id,
    userId: db.userId,
    role: db.role as UserRole,
    groupIds: db.groupIds ?? [],
    createdAt: db.createdAt?.toISOString() ?? new Date().toISOString(),
    expiresAt: null,
  };
}

// =============================================================================
// Public API
// =============================================================================

export async function getUserRoles(userId: string): Promise<DBRole[]> {
  const result = await db.select().from(roles).where(eq(roles.userId, userId));

  return result;
}

export async function getUsersByRole(role: UserRole): Promise<DBRole[]> {
  const result = await db.select().from(roles).where(eq(roles.role, role));

  return result;
}

export async function getAllTeachers(): Promise<TeacherInfo[]> {
  const result = await getUsersByRole('teacher');

  return result.map((r) => ({
    userId: r.userId,
    groupIds: r.groupIds ?? [],
    createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
    createdBy: r.createdBy ?? 'unknown',
  }));
}

export async function getAllAdmins(): Promise<DBRole[]> {
  return getUsersByRole('admin');
}

export async function hasAnyAdmins(): Promise<boolean> {
  const result = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.role, 'admin'))
    .limit(1);

  return result.length > 0;
}

/**
 * Check if a user has a specific role.
 *
 * @param userId - User ID to check
 * @param role - Role to check for
 * @returns Promise resolving to true if user has the role
 */
export async function hasRole(userId: string, role: UserRole): Promise<boolean> {
  const result = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.userId, userId), eq(roles.role, role)))
    .limit(1);

  return result.length > 0;
}

export async function isAdmin(userId: string): Promise<boolean> {
  return hasRole(userId, 'admin');
}

/**
 * Check if a user can approve requests for a specific group.
 * Admins can approve for any group.
 * Teachers can approve for groups they are assigned to.
 *
 * @param userId - User ID to check
 * @param groupId - Group ID to check access for
 * @returns Promise resolving to true if user has permission
 */
export async function canApproveForGroup(userId: string, groupId: string): Promise<boolean> {
  // Check if user is admin (can approve any group)
  const adminCheck = await isAdmin(userId);
  if (adminCheck) {
    return true;
  }

  // Check if user is teacher with access to this group
  const result = await db
    .select({ groupIds: roles.groupIds })
    .from(roles)
    .where(
      and(
        eq(roles.userId, userId),
        eq(roles.role, 'teacher'),
        sql`${groupId} = ANY(${roles.groupIds})`
      )
    )
    .limit(1);

  return result.length > 0;
}

export async function getApprovalGroups(userId: string): Promise<string[] | 'all'> {
  // Check if user is admin
  const adminCheck = await isAdmin(userId);
  if (adminCheck) {
    return 'all';
  }

  // Get teacher groups
  const result = await db
    .select({ groupIds: roles.groupIds })
    .from(roles)
    .where(and(eq(roles.userId, userId), eq(roles.role, 'teacher')))
    .limit(1);

  return result[0]?.groupIds ?? [];
}

/**
 * Assign a role to a user.
 * If the user already has the role, their group list is updated.
 *
 * @param roleData - Role assignment data
 * @returns Promise resolving to the created or updated role
 */
export async function assignRole(
  roleData: AssignRoleData & { createdBy?: string }
): Promise<DBRole> {
  const { userId, role, groupIds, createdBy } = roleData;

  // Check if role already exists
  const existing = await db
    .select()
    .from(roles)
    .where(and(eq(roles.userId, userId), eq(roles.role, role)))
    .limit(1);

  if (existing[0]) {
    // Update existing role with new groups
    const [updated] = await db
      .update(roles)
      .set({ groupIds: groupIds })
      .where(eq(roles.id, existing[0].id))
      .returning();

    if (!updated) {
      throw new Error(`Failed to update role for user "${userId}"`);
    }
    return updated;
  }

  // Create new role
  const id = `role_${uuidv4().slice(0, 8)}`;
  const [created] = await db
    .insert(roles)
    .values({
      id,
      userId,
      role,
      groupIds: groupIds,
      createdBy: createdBy ?? null,
    })
    .returning();

  if (!created) {
    throw new Error(`Failed to create role for user "${userId}"`);
  }
  return created;
}

export async function updateRoleGroups(roleId: string, groupIds: string[]): Promise<DBRole | null> {
  const [result] = await db
    .update(roles)
    .set({ groupIds: groupIds })
    .where(eq(roles.id, roleId))
    .returning();

  return result ?? null;
}

export async function addGroupsToRole(roleId: string, groupIds: string[]): Promise<DBRole | null> {
  const existing = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);

  if (!existing[0]) return null;

  const existingGroups = existing[0].groupIds ?? [];
  const newGroups = [...new Set([...existingGroups, ...groupIds])];

  return updateRoleGroups(roleId, newGroups);
}

export async function removeGroupsFromRole(
  roleId: string,
  groupIds: string[]
): Promise<DBRole | null> {
  const existing = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);

  if (!existing[0]) return null;

  const existingGroups = existing[0].groupIds ?? [];
  const newGroups = existingGroups.filter((g) => !groupIds.includes(g));

  return updateRoleGroups(roleId, newGroups);
}

export async function revokeRole(roleId: string, _revokedBy?: string): Promise<boolean> {
  const result = await db.delete(roles).where(eq(roles.id, roleId));

  return (result.rowCount ?? 0) > 0;
}

export async function revokeAllUserRoles(userId: string, _revokedBy?: string): Promise<number> {
  const result = await db.delete(roles).where(eq(roles.userId, userId));

  return result.rowCount ?? 0;
}

export async function removeGroupFromAllRoles(groupId: string): Promise<number> {
  // Get all roles containing this group
  const rolesWithGroup = await db
    .select()
    .from(roles)
    .where(sql`${groupId} = ANY(${roles.groupIds})`);

  let updated = 0;
  for (const role of rolesWithGroup) {
    const newGroups = (role.groupIds ?? []).filter((g: string) => g !== groupId);
    await db.update(roles).set({ groupIds: newGroups }).where(eq(roles.id, role.id));
    updated++;
  }

  return updated;
}

export async function getRoleById(roleId: string): Promise<DBRole | null> {
  const result = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);

  return result[0] ?? null;
}

export async function getRolesByUser(userId: string): Promise<Role[]> {
  const result = await getUserRoles(userId);
  return result.map(toRoleType);
}

export async function getUsersWithRole(role: UserRole): Promise<string[]> {
  const result = await getUsersByRole(role);
  return result.map((r) => r.userId);
}

export async function updateRole(roleId: string, data: Partial<Role>): Promise<Role | null> {
  const updateValues: Partial<typeof roles.$inferInsert> = {};

  if (data.groupIds !== undefined) {
    updateValues.groupIds = data.groupIds;
  }

  if (Object.keys(updateValues).length === 0) {
    const existing = await getRoleById(roleId);
    return existing ? toRoleType(existing) : null;
  }

  const [result] = await db.update(roles).set(updateValues).where(eq(roles.id, roleId)).returning();

  return result ? toRoleType(result) : null;
}

export async function getStats(): Promise<RoleStats> {
  const result = await db
    .select({
      role: roles.role,
      count: count(),
    })
    .from(roles)
    .groupBy(roles.role);

  const stats: RoleStats = {
    total: 0,
    active: 0,
    admins: 0,
    teachers: 0,
    students: 0,
  };

  result.forEach((row) => {
    const cnt = row.count;
    stats.total += cnt;
    stats.active += cnt;
    if (row.role === 'admin') stats.admins = cnt;
    if (row.role === 'teacher') stats.teachers = cnt;
    if (row.role === 'student') stats.students = cnt;
  });

  return stats;
}

// =============================================================================
// Storage Instance
// =============================================================================

export const roleStorage: IRoleStorage = {
  getRolesByUser,
  getRoleById: async (roleId: string) => {
    const result = await getRoleById(roleId);
    return result ? toRoleType(result) : null;
  },
  getUsersWithRole,
  assignRole: async (data: AssignRoleData) => {
    const result = await assignRole(data);
    return toRoleType(result);
  },
  updateRole,
  revokeRole,
  revokeAllUserRoles,
};

logger.debug('Role storage initialized');

export default roleStorage;
