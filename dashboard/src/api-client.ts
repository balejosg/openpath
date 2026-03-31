/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Dashboard API Client
 *
 * Provides a wrapper around tRPC calls for the Dashboard.
 * This module replaces direct database access with API calls.
 *
 */

import { createTRPCWithAuth, createTRPCPublic, getTRPCErrorMessage, API_URL } from './trpc.js';
import { logger } from './lib/logger.js';

// =============================================================================
// Types
// =============================================================================

/** Group with rule counts (matches API response) */
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
}

/** Rule type */
export type RuleType = 'whitelist' | 'blocked_subdomain' | 'blocked_path';

/** Rule record */
export interface Rule {
  id: string;
  groupId: string;
  type: RuleType;
  value: string;
  comment: string | null;
  createdAt: string;
}

/** Group statistics */
export interface GroupStats {
  groupCount: number;
  whitelistCount: number;
  blockedCount: number;
}

/** System status */
export interface SystemStatus {
  enabled: boolean;
  totalGroups: number;
  activeGroups: number;
  pausedGroups: number;
}

/** Login result */
export interface LoginResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
  error?: string;
}

interface DashboardAuthUser {
  id: string;
  email: string;
  name: string;
}

interface DashboardAuthLoginPayload {
  accessToken: string;
  refreshToken: string;
  user?: DashboardAuthUser;
}

interface DashboardAuthRefreshPayload {
  accessToken: string;
  refreshToken: string;
}

interface DashboardGroupsClientContract {
  list: { query(): Promise<Group[]> };
  getById: { query(input: { id: string }): Promise<Group> };
  getByName: { query(input: { name: string }): Promise<Group> };
  create: {
    mutate(input: { name: string; displayName: string }): Promise<{ id: string; name: string }>;
  };
  update: {
    mutate(input: { id: string; displayName: string; enabled: boolean }): Promise<Group>;
  };
  delete: { mutate(input: { id: string }): Promise<{ deleted: boolean }> };
  listRules: { query(input: { groupId: string; type?: RuleType }): Promise<Rule[]> };
  createRule: {
    mutate(input: {
      groupId: string;
      type: RuleType;
      value: string;
      comment?: string;
    }): Promise<{ id: string }>;
  };
  deleteRule: { mutate(input: { id: string }): Promise<{ deleted: boolean }> };
  bulkCreateRules: {
    mutate(input: {
      groupId: string;
      type: RuleType;
      values: string[];
    }): Promise<{ count: number }>;
  };
  stats: { query(): Promise<GroupStats> };
  systemStatus: { query(): Promise<SystemStatus> };
  toggleSystem: { mutate(input: { enable: boolean }): Promise<SystemStatus> };
  export: { query(input: { groupId: string }): Promise<{ name: string; content: string }> };
  exportAll: { query(): Promise<{ name: string; content: string }[]> };
}

interface DashboardAuthClientContract {
  login: { mutate(input: { email: string; password: string }): Promise<DashboardAuthLoginPayload> };
  refresh: {
    mutate(input: { refreshToken: string }): Promise<DashboardAuthRefreshPayload>;
  };
  logout: { mutate(input: { refreshToken: string }): Promise<unknown> };
  changePassword: {
    mutate(input: { currentPassword: string; newPassword: string }): Promise<unknown>;
  };
}

interface DashboardTrpcClientContract {
  auth: DashboardAuthClientContract;
  groups: DashboardGroupsClientContract;
}

// =============================================================================
// API Client Factory
// =============================================================================

export interface ApiClient {
  // Groups
  getAllGroups(): Promise<Group[]>;
  getGroupById(id: string): Promise<Group | null>;
  getGroupByName(name: string): Promise<Group | null>;
  createGroup(name: string, displayName: string): Promise<{ id: string; name: string }>;
  updateGroup(id: string, displayName: string, enabled: boolean): Promise<Group>;
  deleteGroup(id: string): Promise<boolean>;

  // Rules
  getRulesByGroup(groupId: string, type?: RuleType): Promise<Rule[]>;
  createRule(
    groupId: string,
    type: RuleType,
    value: string,
    comment?: string
  ): Promise<{ id: string }>;
  deleteRule(id: string): Promise<boolean>;
  bulkCreateRules(groupId: string, type: RuleType, values: string[]): Promise<number>;

  // Stats
  getStats(): Promise<GroupStats>;
  getSystemStatus(): Promise<SystemStatus>;
  toggleSystemStatus(enable: boolean): Promise<SystemStatus>;

  // Export
  exportGroup(groupId: string): Promise<{ name: string; content: string }>;
  exportAllGroups(): Promise<{ name: string; content: string }[]>;
}

/**
 * Create an API client with the provided authentication token.
 */
export function createApiClient(token: string): ApiClient {
  const trpc = createTRPCWithAuth(token) as unknown as DashboardTrpcClientContract;

  return {
    // Groups
    getAllGroups(): Promise<Group[]> {
      return trpc.groups.list.query();
    },

    async getGroupById(id: string): Promise<Group | null> {
      try {
        return await trpc.groups.getById.query({ id });
      } catch {
        return null;
      }
    },

    async getGroupByName(name: string): Promise<Group | null> {
      try {
        return await trpc.groups.getByName.query({ name });
      } catch {
        return null;
      }
    },

    createGroup(name: string, displayName: string): Promise<{ id: string; name: string }> {
      return trpc.groups.create.mutate({ name, displayName });
    },

    updateGroup(id: string, displayName: string, enabled: boolean): Promise<Group> {
      return trpc.groups.update.mutate({ id, displayName, enabled });
    },

    async deleteGroup(id: string): Promise<boolean> {
      const result = await trpc.groups.delete.mutate({ id });
      return result.deleted;
    },

    // Rules
    getRulesByGroup(groupId: string, type?: RuleType): Promise<Rule[]> {
      return trpc.groups.listRules.query(type === undefined ? { groupId } : { groupId, type });
    },

    createRule(
      groupId: string,
      type: RuleType,
      value: string,
      comment?: string
    ): Promise<{ id: string }> {
      return trpc.groups.createRule.mutate(
        comment === undefined ? { groupId, type, value } : { groupId, type, value, comment }
      );
    },

    async deleteRule(id: string): Promise<boolean> {
      const result = await trpc.groups.deleteRule.mutate({ id });
      return result.deleted;
    },

    async bulkCreateRules(groupId: string, type: RuleType, values: string[]): Promise<number> {
      const result = await trpc.groups.bulkCreateRules.mutate({ groupId, type, values });
      return result.count;
    },

    // Stats
    getStats(): Promise<GroupStats> {
      return trpc.groups.stats.query();
    },

    getSystemStatus(): Promise<SystemStatus> {
      return trpc.groups.systemStatus.query();
    },

    toggleSystemStatus(enable: boolean): Promise<SystemStatus> {
      return trpc.groups.toggleSystem.mutate({ enable });
    },

    // Export
    exportGroup(groupId: string): Promise<{ name: string; content: string }> {
      return trpc.groups.export.query({ groupId });
    },

    exportAllGroups(): Promise<{ name: string; content: string }[]> {
      return trpc.groups.exportAll.query();
    },
  };
}

// =============================================================================
// Authentication
// =============================================================================

/**
 * Login via API and return tokens.
 *
 * Note: Dashboard users have been migrated to the main users table.
 * Email format: <username>@dashboard.local
 */
export async function login(username: string, password: string): Promise<LoginResult> {
  const trpc = createTRPCPublic() as unknown as DashboardTrpcClientContract;

  // Convert username to email format
  const email = username.includes('@') ? username : `${username}@dashboard.local`;

  try {
    const result = await trpc.auth.login.mutate({ email, password });

    return {
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: {
        id: result.user?.id ?? '',
        email: result.user?.email ?? email,
        name: result.user?.name ?? username,
      },
    };
  } catch (error) {
    logger.error('Login failed', { error: getTRPCErrorMessage(error) });
    return {
      success: false,
      error: getTRPCErrorMessage(error),
    };
  }
}

/**
 * Refresh access token using refresh token.
 */
export async function refreshToken(refreshTokenValue: string): Promise<LoginResult> {
  const trpc = createTRPCPublic() as unknown as DashboardTrpcClientContract;

  try {
    const result = await trpc.auth.refresh.mutate({ refreshToken: refreshTokenValue });

    return {
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  } catch (error) {
    logger.error('Token refresh failed', { error: getTRPCErrorMessage(error) });
    return {
      success: false,
      error: getTRPCErrorMessage(error),
    };
  }
}

/**
 * Logout (invalidate refresh token).
 */
export async function logout(accessToken: string, refreshTokenValue: string): Promise<boolean> {
  const trpc = createTRPCWithAuth(accessToken) as unknown as DashboardTrpcClientContract;

  try {
    await trpc.auth.logout.mutate({ refreshToken: refreshTokenValue });
    return true;
  } catch (error) {
    logger.error('Logout failed', { error: getTRPCErrorMessage(error) });
    return false;
  }
}

/**
 * Change password.
 * Note: This endpoint may not exist in the current API and needs to be added.
 */
export async function changePassword(
  accessToken: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const trpc = createTRPCWithAuth(accessToken) as unknown as DashboardTrpcClientContract;

  try {
    await trpc.auth.changePassword.mutate({
      currentPassword,
      newPassword,
    });
    return { success: true };
  } catch (error) {
    logger.error('Change password failed', { error: getTRPCErrorMessage(error) });
    return {
      success: false,
      error: getTRPCErrorMessage(error),
    };
  }
}

// =============================================================================
// Export endpoint URL (for file downloads)
// =============================================================================

/**
 * Get the URL for downloading a group's whitelist file.
 */
export function getExportUrl(groupName: string): string {
  return `${API_URL}/export/${encodeURIComponent(groupName)}.txt`;
}
