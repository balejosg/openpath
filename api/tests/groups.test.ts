/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Groups Router Tests (tRPC)
 *
 * Tests for whitelist groups and rules management via tRPC.
 * Run with: npm run test:groups
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import {
  getAvailablePort,
  trpcQuery,
  trpcMutate,
  parseTRPC,
  bearerAuth,
  assertStatus,
  TEST_RUN_ID,
  resetDb,
} from './test-utils.js';
import { closeConnection } from '../src/db/index.js';

let PORT: number;
let API_URL: string;

// Global timeout - force exit if tests hang (30s)
const GLOBAL_TIMEOUT = setTimeout(() => {
  console.error('\n❌ Groups tests timed out! Forcing exit...');
  process.exit(1);
}, 30000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;

// Use legacy admin token approach (same as roles.test.ts)
const ADMIN_TOKEN = 'test-admin-token';

// =============================================================================
// Type Definitions
// =============================================================================

interface GroupWithCounts {
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

interface Rule {
  id: string;
  groupId: string;
  type: string;
  value: string;
  comment: string | null;
  createdAt: string;
}

interface CreateGroupResult {
  id: string;
  name: string;
}

interface GroupStats {
  groupCount: number;
  whitelistCount: number;
  blockedCount: number;
}

interface SystemStatus {
  enabled: boolean;
  totalGroups: number;
  activeGroups: number;
  pausedGroups: number;
}

// =============================================================================
// Test Helpers
// =============================================================================

function uniqueGroupName(prefix: string): string {
  return `${prefix}-${TEST_RUN_ID}-${Math.random().toString(36).slice(2, 6)}`;
}

// =============================================================================
// Tests
// =============================================================================

await describe('Groups Router (tRPC)', { timeout: 30000 }, async () => {
  before(async () => {
    await resetDb();

    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;

    const { app } = await import('../src/server.js');

    server = app.listen(PORT, () => {
      console.log(`Groups test server started on port ${String(PORT)}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  after(async () => {
    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          console.log('Groups test server closed');
          resolve();
        });
      });
    }
    await closeConnection();
  });

  // =========================================================================
  // Authorization Tests
  // =========================================================================
  await describe('Authorization', async () => {
    await test('should reject unauthenticated requests', async () => {
      const response = await trpcQuery(API_URL, 'groups.list');
      assert.strictEqual(response.status, 401);
    });

    await test('should reject non-admin users', async () => {
      // First, create an admin user to prevent auto-admin assignment
      const adminEmail = `admin-${TEST_RUN_ID}@test.local`;
      await trpcMutate(API_URL, 'auth.register', {
        email: adminEmail,
        password: 'AdminPassword123!',
        name: 'Admin User',
      });

      // Now register a non-admin user (won't get admin since one exists)
      const email = `nonadmin-${TEST_RUN_ID}@test.local`;
      const password = 'SecurePassword123!';

      await trpcMutate(API_URL, 'auth.register', {
        email,
        password,
        name: 'Non Admin User',
      });

      const loginResp = await trpcMutate(API_URL, 'auth.login', { email, password });
      const { data } = (await parseTRPC(loginResp)) as { data?: { accessToken?: string } };

      const response = await trpcQuery(
        API_URL,
        'groups.list',
        undefined,
        bearerAuth(data?.accessToken ?? '')
      );
      assert.strictEqual(response.status, 403);
    });

    await test('should accept admin users', async () => {
      const response = await trpcQuery(API_URL, 'groups.list', undefined, bearerAuth(ADMIN_TOKEN));
      assertStatus(response, 200);
    });
  });

  // =========================================================================
  // Group CRUD Tests
  // =========================================================================
  await describe('Group CRUD Operations', async () => {
    let testGroupId: string;
    const testGroupName = uniqueGroupName('crud-test');

    await test('should list groups (initially may be empty)', async () => {
      const response = await trpcQuery(API_URL, 'groups.list', undefined, bearerAuth(ADMIN_TOKEN));
      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: GroupWithCounts[] };
      assert.ok(Array.isArray(data));
    });

    await test('should create a new group', async () => {
      const response = await trpcMutate(
        API_URL,
        'groups.create',
        {
          name: testGroupName,
          displayName: 'CRUD Test Group',
        },
        bearerAuth(ADMIN_TOKEN)
      );

      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: CreateGroupResult };
      assert.ok(data?.id);
      assert.ok(data.name);
      testGroupId = data.id;
    });

    await test('should get group by ID', async () => {
      const response = await trpcQuery(
        API_URL,
        'groups.getById',
        { id: testGroupId },
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: GroupWithCounts };
      assert.ok(data);
      assert.strictEqual(data.id, testGroupId);
      assert.strictEqual(data.displayName, 'CRUD Test Group');
      assert.strictEqual(data.enabled, true);
    });

    await test('should get group by name', async () => {
      const response = await trpcQuery(
        API_URL,
        'groups.getByName',
        { name: testGroupName },
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: GroupWithCounts };
      assert.ok(data);
      assert.strictEqual(data.id, testGroupId);
    });

    await test('should update a group', async () => {
      const response = await trpcMutate(
        API_URL,
        'groups.update',
        {
          id: testGroupId,
          displayName: 'Updated CRUD Test Group',
          enabled: false,
        },
        bearerAuth(ADMIN_TOKEN)
      );

      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: GroupWithCounts };
      assert.ok(data);
      assert.strictEqual(data.displayName, 'Updated CRUD Test Group');
      assert.strictEqual(data.enabled, false);
    });

    await test('should reject creating duplicate group name', async () => {
      const response = await trpcMutate(
        API_URL,
        'groups.create',
        {
          name: testGroupName,
          displayName: 'Duplicate Group',
        },
        bearerAuth(ADMIN_TOKEN)
      );

      assert.strictEqual(response.status, 409);
    });

    await test('should return NOT_FOUND for non-existent group', async () => {
      const response = await trpcQuery(
        API_URL,
        'groups.getById',
        { id: 'non-existent-id' },
        bearerAuth(ADMIN_TOKEN)
      );
      assert.strictEqual(response.status, 404);
    });

    await test('should delete a group', async () => {
      // Create a group to delete
      const deleteGroupName = uniqueGroupName('delete-test');
      const createResp = await trpcMutate(
        API_URL,
        'groups.create',
        {
          name: deleteGroupName,
          displayName: 'Group to Delete',
        },
        bearerAuth(ADMIN_TOKEN)
      );

      const { data: created } = (await parseTRPC(createResp)) as { data?: CreateGroupResult };
      assert.ok(created?.id);

      // Delete it
      const deleteResp = await trpcMutate(
        API_URL,
        'groups.delete',
        { id: created.id },
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(deleteResp, 200);

      const { data } = (await parseTRPC(deleteResp)) as { data?: { deleted: boolean } };
      assert.strictEqual(data?.deleted, true);

      // Verify it's gone
      const getResp = await trpcQuery(
        API_URL,
        'groups.getById',
        { id: created.id },
        bearerAuth(ADMIN_TOKEN)
      );
      assert.strictEqual(getResp.status, 404);
    });
  });

  // =========================================================================
  // Teacher Access Control Tests
  // =========================================================================
  await describe('Teacher Access Control', async () => {
    let teacherToken: string;
    let teacherGroupId: string;
    let otherGroupId: string;
    let otherRuleId: string;

    before(async () => {
      // Create one group the teacher can manage, and one they can't.
      const teacherGroupName = uniqueGroupName('teacher-allowed');
      const otherGroupName = uniqueGroupName('teacher-denied');

      const allowedGroupResp = await trpcMutate(
        API_URL,
        'groups.create',
        {
          name: teacherGroupName,
          displayName: 'Teacher Allowed Group',
        },
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(allowedGroupResp, 200);
      const { data: allowedGroup } = (await parseTRPC(allowedGroupResp)) as {
        data?: CreateGroupResult;
      };
      teacherGroupId = allowedGroup?.id ?? '';
      assert.ok(teacherGroupId);

      const deniedGroupResp = await trpcMutate(
        API_URL,
        'groups.create',
        {
          name: otherGroupName,
          displayName: 'Teacher Denied Group',
        },
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(deniedGroupResp, 200);
      const { data: deniedGroup } = (await parseTRPC(deniedGroupResp)) as {
        data?: CreateGroupResult;
      };
      otherGroupId = deniedGroup?.id ?? '';
      assert.ok(otherGroupId);

      // Seed one rule in the denied group to validate delete/bulk-delete checks.
      const deniedRuleResp = await trpcMutate(
        API_URL,
        'groups.createRule',
        {
          groupId: otherGroupId,
          type: 'whitelist',
          value: `denied-${TEST_RUN_ID}-${Math.random().toString(36).slice(2, 6)}.com`,
        },
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(deniedRuleResp, 200);
      const { data: deniedRule } = (await parseTRPC(deniedRuleResp)) as { data?: { id: string } };
      otherRuleId = deniedRule?.id ?? '';
      assert.ok(otherRuleId);

      // Create teacher user scoped to the allowed group.
      const teacherEmail = `teacher-${TEST_RUN_ID}-${Math.random().toString(36).slice(2, 6)}@test.local`;
      const teacherPassword = 'TeacherPassword123!';
      const createTeacherResp = await trpcMutate(
        API_URL,
        'users.create',
        {
          email: teacherEmail,
          password: teacherPassword,
          name: 'Teacher User',
          role: 'teacher',
          groupIds: [teacherGroupId],
        },
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(createTeacherResp, 200);

      const loginResp = await trpcMutate(API_URL, 'auth.login', {
        email: teacherEmail,
        password: teacherPassword,
      });
      assertStatus(loginResp, 200);

      const login = (await parseTRPC(loginResp)) as { data?: { accessToken?: string } };
      teacherToken = login.data?.accessToken ?? '';
      assert.ok(teacherToken);
    });

    await test('should allow teacher to list only assigned groups', async () => {
      const response = await trpcQuery(API_URL, 'groups.list', undefined, bearerAuth(teacherToken));
      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: GroupWithCounts[] };
      assert.ok(Array.isArray(data));
      assert.ok(data.some((g) => g.id === teacherGroupId));
      assert.ok(!data.some((g) => g.id === otherGroupId));
    });

    await test('should allow teacher to manage rules only in assigned group', async () => {
      const value = `teacher-${TEST_RUN_ID}-${Math.random().toString(36).slice(2, 6)}.com`;

      const createResp = await trpcMutate(
        API_URL,
        'groups.createRule',
        {
          groupId: teacherGroupId,
          type: 'whitelist',
          value,
        },
        bearerAuth(teacherToken)
      );
      assertStatus(createResp, 200);

      const listResp = await trpcQuery(
        API_URL,
        'groups.listRules',
        { groupId: teacherGroupId },
        bearerAuth(teacherToken)
      );
      assertStatus(listResp, 200);
      const { data } = (await parseTRPC(listResp)) as { data?: Rule[] };
      assert.ok(Array.isArray(data));
      assert.ok(data.some((r) => r.value === value));

      const forbiddenList = await trpcQuery(
        API_URL,
        'groups.listRules',
        { groupId: otherGroupId },
        bearerAuth(teacherToken)
      );
      assert.strictEqual(forbiddenList.status, 403);
    });

    await test('should forbid teacher from deleting rules outside their groups', async () => {
      const response = await trpcMutate(
        API_URL,
        'groups.deleteRule',
        { id: otherRuleId },
        bearerAuth(teacherToken)
      );
      assert.strictEqual(response.status, 403);

      const bulkResp = await trpcMutate(
        API_URL,
        'groups.bulkDeleteRules',
        { ids: [otherRuleId] },
        bearerAuth(teacherToken)
      );
      assert.strictEqual(bulkResp.status, 403);
    });

    await test('should forbid teacher from system-level group operations', async () => {
      const statsResp = await trpcQuery(
        API_URL,
        'groups.stats',
        undefined,
        bearerAuth(teacherToken)
      );
      assert.strictEqual(statsResp.status, 403);

      const systemStatusResp = await trpcQuery(
        API_URL,
        'groups.systemStatus',
        undefined,
        bearerAuth(teacherToken)
      );
      assert.strictEqual(systemStatusResp.status, 403);

      const toggleResp = await trpcMutate(
        API_URL,
        'groups.toggleSystem',
        { enable: false },
        bearerAuth(teacherToken)
      );
      assert.strictEqual(toggleResp.status, 403);

      const exportAllResp = await trpcQuery(
        API_URL,
        'groups.exportAll',
        undefined,
        bearerAuth(teacherToken)
      );
      assert.strictEqual(exportAllResp.status, 403);
    });
  });

  // =========================================================================
  // Rule CRUD Tests
  // =========================================================================
  await describe('Rule CRUD Operations', async () => {
    let ruleGroupId: string;
    let testRuleId: string;
    const ruleGroupName = uniqueGroupName('rule-test');

    before(async () => {
      // Create a group for rule testing
      const response = await trpcMutate(
        API_URL,
        'groups.create',
        {
          name: ruleGroupName,
          displayName: 'Rule Test Group',
        },
        bearerAuth(ADMIN_TOKEN)
      );

      const { data } = (await parseTRPC(response)) as { data?: CreateGroupResult };
      ruleGroupId = data?.id ?? '';
    });

    await test('should list rules (initially empty)', async () => {
      const response = await trpcQuery(
        API_URL,
        'groups.listRules',
        { groupId: ruleGroupId },
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: Rule[] };
      assert.ok(Array.isArray(data));
      assert.strictEqual(data.length, 0);
    });

    await test('should create a whitelist rule', async () => {
      const response = await trpcMutate(
        API_URL,
        'groups.createRule',
        {
          groupId: ruleGroupId,
          type: 'whitelist',
          value: 'example.com',
          comment: 'Test whitelist entry',
        },
        bearerAuth(ADMIN_TOKEN)
      );

      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: { id: string } };
      assert.ok(data?.id);
      testRuleId = data.id;
    });

    await test('should create a blocked_subdomain rule', async () => {
      const response = await trpcMutate(
        API_URL,
        'groups.createRule',
        {
          groupId: ruleGroupId,
          type: 'blocked_subdomain',
          value: 'ads.example.com',
        },
        bearerAuth(ADMIN_TOKEN)
      );

      assertStatus(response, 200);
    });

    await test('should create a blocked_path rule', async () => {
      const response = await trpcMutate(
        API_URL,
        'groups.createRule',
        {
          groupId: ruleGroupId,
          type: 'blocked_path',
          value: '*/api/tracking',
        },
        bearerAuth(ADMIN_TOKEN)
      );

      assertStatus(response, 200);
    });

    await test('should list all rules for group', async () => {
      const response = await trpcQuery(
        API_URL,
        'groups.listRules',
        { groupId: ruleGroupId },
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: Rule[] };
      assert.ok(Array.isArray(data));
      assert.strictEqual(data.length, 3);
    });

    await test('should filter rules by type', async () => {
      const response = await trpcQuery(
        API_URL,
        'groups.listRules',
        {
          groupId: ruleGroupId,
          type: 'whitelist',
        },
        bearerAuth(ADMIN_TOKEN)
      );

      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: Rule[] };
      assert.ok(Array.isArray(data));
      assert.strictEqual(data.length, 1);
      assert.ok(data[0]);
      assert.strictEqual(data[0].type, 'whitelist');
    });

    await test('should reject duplicate rule', async () => {
      const response = await trpcMutate(
        API_URL,
        'groups.createRule',
        {
          groupId: ruleGroupId,
          type: 'whitelist',
          value: 'example.com',
        },
        bearerAuth(ADMIN_TOKEN)
      );

      assert.strictEqual(response.status, 409);
    });

    await test('should delete a rule', async () => {
      const response = await trpcMutate(
        API_URL,
        'groups.deleteRule',
        { id: testRuleId },
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: { deleted: boolean } };
      assert.strictEqual(data?.deleted, true);
    });
  });

  // =========================================================================
  // Bulk Operations Tests
  // =========================================================================
  await describe('Bulk Rule Operations', async () => {
    let bulkGroupId: string;
    const bulkGroupName = uniqueGroupName('bulk-test');

    before(async () => {
      const response = await trpcMutate(
        API_URL,
        'groups.create',
        {
          name: bulkGroupName,
          displayName: 'Bulk Test Group',
        },
        bearerAuth(ADMIN_TOKEN)
      );

      const { data } = (await parseTRPC(response)) as { data?: CreateGroupResult };
      bulkGroupId = data?.id ?? '';
    });

    await test('should bulk create rules', async () => {
      const domains = ['google.com', 'github.com', 'stackoverflow.com', 'mozilla.org'];

      const response = await trpcMutate(
        API_URL,
        'groups.bulkCreateRules',
        {
          groupId: bulkGroupId,
          type: 'whitelist',
          values: domains,
        },
        bearerAuth(ADMIN_TOKEN)
      );

      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: { count: number } };
      assert.strictEqual(data?.count, 4);
    });

    await test('should skip duplicates in bulk create', async () => {
      const domains = [
        'google.com', // Already exists
        'newdomain.com',
        'stackoverflow.com', // Already exists
      ];

      const response = await trpcMutate(
        API_URL,
        'groups.bulkCreateRules',
        {
          groupId: bulkGroupId,
          type: 'whitelist',
          values: domains,
        },
        bearerAuth(ADMIN_TOKEN)
      );

      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: { count: number } };
      assert.strictEqual(data?.count, 1); // Only newdomain.com should be added
    });
  });

  // =========================================================================
  // Statistics and Status Tests
  // =========================================================================
  await describe('Statistics and System Status', async () => {
    await test('should return group statistics', async () => {
      const response = await trpcQuery(API_URL, 'groups.stats', undefined, bearerAuth(ADMIN_TOKEN));
      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: GroupStats };
      assert.ok(data);
      assert.ok(typeof data.groupCount === 'number');
      assert.ok(typeof data.whitelistCount === 'number');
      assert.ok(typeof data.blockedCount === 'number');
    });

    await test('should return system status', async () => {
      const response = await trpcQuery(
        API_URL,
        'groups.systemStatus',
        undefined,
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: SystemStatus };
      assert.ok(data);
      assert.ok(typeof data.enabled === 'boolean');
      assert.ok(typeof data.totalGroups === 'number');
      assert.ok(typeof data.activeGroups === 'number');
      assert.ok(typeof data.pausedGroups === 'number');
    });

    await test('should toggle system status', async () => {
      // Get current status
      const statusResp = await trpcQuery(
        API_URL,
        'groups.systemStatus',
        undefined,
        bearerAuth(ADMIN_TOKEN)
      );
      const { data: initialStatus } = (await parseTRPC(statusResp)) as { data?: SystemStatus };

      // Toggle to opposite
      const toggleResp = await trpcMutate(
        API_URL,
        'groups.toggleSystem',
        {
          enable: !initialStatus?.enabled,
        },
        bearerAuth(ADMIN_TOKEN)
      );

      assertStatus(toggleResp, 200);

      const { data: newStatus } = (await parseTRPC(toggleResp)) as { data?: SystemStatus };
      assert.strictEqual(newStatus?.enabled, !initialStatus?.enabled);

      // Toggle back to original
      await trpcMutate(
        API_URL,
        'groups.toggleSystem',
        {
          enable: initialStatus?.enabled ?? true,
        },
        bearerAuth(ADMIN_TOKEN)
      );
    });
  });

  // =========================================================================
  // Export Tests
  // =========================================================================
  await describe('Export Operations', async () => {
    let exportGroupId: string;
    const exportGroupName = uniqueGroupName('export-test');

    before(async () => {
      // Create a group with some rules
      const createResp = await trpcMutate(
        API_URL,
        'groups.create',
        {
          name: exportGroupName,
          displayName: 'Export Test Group',
        },
        bearerAuth(ADMIN_TOKEN)
      );

      const { data } = (await parseTRPC(createResp)) as { data?: CreateGroupResult };
      exportGroupId = data?.id ?? '';

      // Add some rules
      await trpcMutate(
        API_URL,
        'groups.bulkCreateRules',
        {
          groupId: exportGroupId,
          type: 'whitelist',
          values: ['export-test-1.com', 'export-test-2.com'],
        },
        bearerAuth(ADMIN_TOKEN)
      );
    });

    await test('should export a group', async () => {
      const response = await trpcQuery(
        API_URL,
        'groups.export',
        { groupId: exportGroupId },
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as { data?: { name: string; content: string } };
      assert.ok(data);
      assert.ok(data.name);
      assert.ok(data.content);
      assert.ok(data.content.includes('export-test-1.com'));
      assert.ok(data.content.includes('export-test-2.com'));
    });

    await test('should export all groups', async () => {
      const response = await trpcQuery(
        API_URL,
        'groups.exportAll',
        undefined,
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(response, 200);

      const { data } = (await parseTRPC(response)) as {
        data?: { name: string; content: string }[];
      };
      assert.ok(Array.isArray(data));
      assert.ok(data.length > 0);

      // Find our export test group
      const exportGroup = data.find((g) => g.name === exportGroupName);
      assert.ok(exportGroup, 'Export test group should be in the list');
    });

    await test('should return NOT_FOUND for non-existent group export', async () => {
      const response = await trpcQuery(
        API_URL,
        'groups.export',
        { groupId: 'non-existent' },
        bearerAuth(ADMIN_TOKEN)
      );
      assert.strictEqual(response.status, 404);
    });
  });

  // =========================================================================
  // REST Endpoint Tests (/export/:name.txt)
  // =========================================================================
  await describe('REST Export Endpoint', async () => {
    let restGroupName: string;
    let restGroupId: string;

    before(async () => {
      restGroupName = uniqueGroupName('rest-export');

      const createResp = await trpcMutate(
        API_URL,
        'groups.create',
        {
          name: restGroupName,
          displayName: 'REST Export Test Group',
        },
        bearerAuth(ADMIN_TOKEN)
      );

      const { data } = (await parseTRPC(createResp)) as { data?: CreateGroupResult };
      restGroupId = data?.id ?? '';
      restGroupName = data?.name ?? restGroupName; // Use sanitized name

      await trpcMutate(
        API_URL,
        'groups.bulkCreateRules',
        {
          groupId: restGroupId,
          type: 'whitelist',
          values: ['rest-domain-1.com', 'rest-domain-2.com'],
        },
        bearerAuth(ADMIN_TOKEN)
      );
    });

    await test('should serve group export as plain text', async () => {
      const response = await fetch(`${API_URL}/export/${restGroupName}.txt`);
      assertStatus(response, 200);

      const contentType = response.headers.get('content-type');
      assert.ok(
        contentType?.includes('text/plain'),
        `Expected text/plain, got ${String(contentType)}`
      );

      const content = await response.text();
      assert.ok(content.includes('rest-domain-1.com'));
      assert.ok(content.includes('rest-domain-2.com'));
    });

    await test('should return 404 for non-existent group', async () => {
      const response = await fetch(`${API_URL}/export/non-existent-group.txt`);
      assert.strictEqual(response.status, 404);
    });

    await test('should return empty content for disabled group', async () => {
      // Disable the group
      await trpcMutate(
        API_URL,
        'groups.update',
        {
          id: restGroupId,
          displayName: 'REST Export Test Group',
          enabled: false,
        },
        bearerAuth(ADMIN_TOKEN)
      );

      const response = await fetch(`${API_URL}/export/${restGroupName}.txt`);
      assertStatus(response, 200);

      const content = await response.text();
      // Content should be empty or contain only comments
      const lines = content.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'));
      assert.strictEqual(lines.length, 0, 'Disabled group should export no rules');

      // Re-enable the group
      await trpcMutate(
        API_URL,
        'groups.update',
        {
          id: restGroupId,
          displayName: 'REST Export Test Group',
          enabled: true,
        },
        bearerAuth(ADMIN_TOKEN)
      );
    });
  });
});
