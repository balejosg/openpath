import assert from 'node:assert';

import { startHttpTestHarness, type HttpTestHarness } from './http-test-harness.js';
import {
  TEST_RUN_ID,
  assertStatus,
  bearerAuth,
  parseTRPC,
  registerAndVerifyUser,
} from './test-utils.js';

export interface GroupWithCounts {
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

export interface Rule {
  id: string;
  groupId: string;
  type: string;
  value: string;
  comment: string | null;
  createdAt: string;
}

export interface CreateGroupResult {
  id: string;
  name: string;
}

export interface GroupStats {
  groupCount: number;
  whitelistCount: number;
  blockedCount: number;
}

export interface SystemStatus {
  enabled: boolean;
  totalGroups: number;
  activeGroups: number;
  pausedGroups: number;
}

export interface GroupsTestHarness extends HttpTestHarness {
  adminToken: string;
  createGroup: (input?: {
    displayName?: string;
    name?: string;
    visibility?: 'private' | 'instance_public';
  }) => Promise<CreateGroupResult>;
  createTeacherSession: (groupIds: string[]) => Promise<{ accessToken: string }>;
  createVerifiedUserSession: (prefix: string) => Promise<{ accessToken: string; email: string }>;
}

export function uniqueGroupName(prefix: string): string {
  return `${prefix}-${TEST_RUN_ID}-${Math.random().toString(36).slice(2, 6)}`;
}

async function loginWithPassword(
  harness: HttpTestHarness,
  email: string,
  password: string
): Promise<string> {
  const loginResp = await harness.trpcMutate('auth.login', { email, password });
  assertStatus(loginResp, 200);

  const login = (await parseTRPC(loginResp)) as { data?: { accessToken?: string } };
  const accessToken = login.data?.accessToken ?? '';
  assert.ok(accessToken, 'Expected login to return access token');
  return accessToken;
}

export async function startGroupsTestHarness(): Promise<GroupsTestHarness> {
  const harness = await startHttpTestHarness({
    env: {
      JWT_SECRET: 'test-jwt-secret',
    },
    readyDelayMs: 1000,
    resetDb: true,
  });

  const adminToken = (await harness.bootstrapAdminSession({ name: 'Groups Test Admin' }))
    .accessToken;

  return {
    ...harness,
    adminToken,
    createGroup: async (
      input = {}
    ): Promise<{
      id: string;
      name: string;
    }> => {
      const name = input.name ?? uniqueGroupName('group');
      const displayName = input.displayName ?? name;

      const response = await harness.trpcMutate(
        'groups.create',
        {
          name,
          displayName,
          ...(input.visibility ? { visibility: input.visibility } : {}),
        },
        bearerAuth(adminToken)
      );
      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: CreateGroupResult };
      assert.ok(data?.id, 'Expected created group id');
      return data;
    },
    createTeacherSession: async (
      groupIds
    ): Promise<{
      accessToken: string;
    }> => {
      const email = `teacher-${TEST_RUN_ID}-${Math.random().toString(36).slice(2, 6)}@test.local`;
      const password = 'TeacherPassword123!';

      const createTeacherResp = await harness.trpcMutate(
        'users.create',
        {
          email,
          password,
          name: 'Teacher User',
          role: 'teacher',
          groupIds,
        },
        bearerAuth(adminToken)
      );
      assertStatus(createTeacherResp, 200);

      const accessToken = await loginWithPassword(harness, email, password);
      return { accessToken };
    },
    createVerifiedUserSession: async (
      prefix
    ): Promise<{
      accessToken: string;
      email: string;
    }> => {
      const email = `${prefix}-${TEST_RUN_ID}@test.local`;
      const password = 'SecurePassword123!';
      const { verifyResponse } = await registerAndVerifyUser(harness.apiUrl, {
        email,
        password,
        name: `${prefix} user`,
      });
      assert.strictEqual(verifyResponse?.status, 200);

      const accessToken = await loginWithPassword(harness, email, password);
      return { accessToken, email: email.toLowerCase() };
    },
  };
}
