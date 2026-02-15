/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Dashboard API Client
 *
 * Provides a wrapper around tRPC calls for the Dashboard.
 * This module replaces direct database access with API calls.
 *
 * NOTE: This file uses type assertions because the tRPC types are inferred
 * from the API package which needs to be rebuilt after adding the groups router.
 * The unsafe type operations are intentional and will be properly typed
 * after running `npm run build --workspace=@openpath/api`.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/require-await */

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
  const trpc = createTRPCWithAuth(token);

  return {
    // Groups
    async getAllGroups(): Promise<Group[]> {
      // Type assertion needed until API is rebuilt with new router
      return (trpc as any).groups.list.query();
    },

    async getGroupById(id: string): Promise<Group | null> {
      try {
        return await (trpc as any).groups.getById.query({ id });
      } catch {
        return null;
      }
    },

    async getGroupByName(name: string): Promise<Group | null> {
      try {
        return await (trpc as any).groups.getByName.query({ name });
      } catch {
        return null;
      }
    },

    async createGroup(name: string, displayName: string): Promise<{ id: string; name: string }> {
      return (trpc as any).groups.create.mutate({ name, displayName });
    },

    async updateGroup(id: string, displayName: string, enabled: boolean): Promise<Group> {
      return (trpc as any).groups.update.mutate({ id, displayName, enabled });
    },

    async deleteGroup(id: string): Promise<boolean> {
      const result = await (trpc as any).groups.delete.mutate({ id });
      return result.deleted;
    },

    // Rules
    async getRulesByGroup(groupId: string, type?: RuleType): Promise<Rule[]> {
      return (trpc as any).groups.listRules.query({ groupId, type });
    },

    async createRule(
      groupId: string,
      type: RuleType,
      value: string,
      comment?: string
    ): Promise<{ id: string }> {
      return (trpc as any).groups.createRule.mutate({ groupId, type, value, comment });
    },

    async deleteRule(id: string): Promise<boolean> {
      const result = await (trpc as any).groups.deleteRule.mutate({ id });
      return result.deleted;
    },

    async bulkCreateRules(groupId: string, type: RuleType, values: string[]): Promise<number> {
      const result = await (trpc as any).groups.bulkCreateRules.mutate({ groupId, type, values });
      return result.count;
    },

    // Stats
    async getStats(): Promise<GroupStats> {
      return (trpc as any).groups.stats.query();
    },

    async getSystemStatus(): Promise<SystemStatus> {
      return (trpc as any).groups.systemStatus.query();
    },

    async toggleSystemStatus(enable: boolean): Promise<SystemStatus> {
      return (trpc as any).groups.toggleSystem.mutate({ enable });
    },

    // Export
    async exportGroup(groupId: string): Promise<{ name: string; content: string }> {
      return (trpc as any).groups.export.query({ groupId });
    },

    async exportAllGroups(): Promise<{ name: string; content: string }[]> {
      return (trpc as any).groups.exportAll.query();
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
  const trpc = createTRPCPublic();

  // Convert username to email format
  const email = username.includes('@') ? username : `${username}@dashboard.local`;

  try {
    const result = await trpc.auth.login.mutate({ email, password });

    return {
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: {
        id:
          (result as unknown as { user?: { id: string; email: string; name: string } }).user?.id ??
          '',
        email:
          (result as unknown as { user?: { id: string; email: string; name: string } }).user
            ?.email ?? email,
        name:
          (result as unknown as { user?: { id: string; email: string; name: string } }).user
            ?.name ?? username,
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
  const trpc = createTRPCPublic();

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
  const trpc = createTRPCWithAuth(accessToken);

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
  const trpc = createTRPCWithAuth(accessToken);

  try {
    await (trpc as any).auth.changePassword.mutate({
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
