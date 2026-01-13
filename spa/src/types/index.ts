export type RuleType = 'whitelist' | 'blockedSubdomains' | 'blockedPaths';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: string;
}

export type UserRole = 'admin' | 'teacher' | 'student';

export interface RoleInfo {
  role: UserRole;
  groupIds: string[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  roles: RoleInfo[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string | number;
  tokenType?: string;
}

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  roles: RoleInfo[];
}

export interface Group {
  id: string;
  name: string;
  displayName: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string | null;
  whitelistCount: number;
  blockedSubdomainCount: number;
  blockedPathCount: number;
  // Legacy fields for backward compatibility
  path?: string;
  sha?: string;
  stats?: {
    whitelist: number;
    blockedSubdomains: number;
    blockedPaths: number;
  };
}

export type APIResponse<T> = { success: true; data: T } | { success: false; error: string };
