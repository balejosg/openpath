import { UserRole } from '../types';

export const CREATE_USER_ROLES = ['teacher', 'admin'] as const;
export type CreateUserRole = (typeof CREATE_USER_ROLES)[number];
export const DEFAULT_CREATE_USER_ROLE: CreateUserRole = 'teacher';

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.TEACHER]: 'Profesor',
  [UserRole.STUDENT]: 'Usuario',
  [UserRole.NO_ROLES]: 'Sin Rol',
};

export function mapBackendRoleToUserRole(role: string): UserRole {
  switch (role) {
    case 'admin':
      return UserRole.ADMIN;
    case 'teacher':
      return UserRole.TEACHER;
    case 'student':
    case 'user':
    case 'viewer':
      return UserRole.STUDENT;
    default:
      return UserRole.NO_ROLES;
  }
}

export function getPrimaryRole(roles: readonly string[]): string {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('teacher')) return 'teacher';
  return 'user';
}

export function getRoleDisplayLabel(role: string): string {
  if (role === 'admin') return 'Admin';
  if (role === 'teacher') return 'Profesor';
  if (role === 'student' || role === 'viewer' || role === 'user') return 'Usuario';
  return role;
}
