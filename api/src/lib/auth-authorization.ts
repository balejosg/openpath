import { blacklistToken as persistBlacklistedToken } from './token-store.js';
import { verifyToken } from './auth-verify.js';
import type { DbExecutor } from '../db/index.js';
import type { RoleInfo } from '../types/index.js';

export interface DecodedWithRoles {
  sub: string;
  email?: string;
  name?: string;
  roles?: RoleInfo[];
}

export async function blacklistToken(token: string, executor?: DbExecutor): Promise<boolean> {
  const decoded = await verifyToken(token);
  const expiresAt = decoded?.exp
    ? new Date(decoded.exp * 1000)
    : new Date(Date.now() + 24 * 60 * 60 * 1000);
  await persistBlacklistedToken(token, expiresAt, executor);
  return true;
}

export function isAdminToken(decoded: DecodedWithRoles | null | undefined): boolean {
  if (!decoded?.roles) return false;
  return decoded.roles.some((role) => role.role === 'admin');
}

export function canApproveGroup(
  decoded: DecodedWithRoles | null | undefined,
  groupId: string
): boolean {
  if (!decoded?.roles) return false;
  if (isAdminToken(decoded)) return true;

  return decoded.roles.some((role) => role.role === 'teacher' && role.groupIds.includes(groupId));
}

export function getApprovalGroups(decoded: DecodedWithRoles | null | undefined): string[] | 'all' {
  if (!decoded?.roles) return [];
  if (isAdminToken(decoded)) return 'all';

  const groups = new Set<string>();
  decoded.roles
    .filter((role) => role.role === 'teacher')
    .forEach((role) => {
      role.groupIds.forEach((groupId) => groups.add(groupId));
    });

  return Array.from(groups);
}
