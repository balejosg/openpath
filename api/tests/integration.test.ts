/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Integration Tests - API-to-client workflow validation (tRPC)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import { getAvailablePort, resetDb } from './test-utils.js';
import { closeConnection } from '../src/db/index.js';

let PORT: number;
let BASE_URL: string;

process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'integration-test-admin-token';
process.env.SHARED_SECRET = 'integration-test-shared-secret';
process.env.JWT_SECRET = 'integration-test-jwt-secret';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const SHARED_SECRET = process.env.SHARED_SECRET;

// Unique ID for this test run
const TEST_RUN_ID = `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
const INTEGRATION_EMAIL = `integration-${TEST_RUN_ID}@test.local`;

let server: Server | undefined;

// Helper to call tRPC mutations
async function trpcMutate(
  procedure: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  const response = await fetch(`${BASE_URL}/trpc/${procedure}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(input),
  });
  return response;
}

// Helper to call tRPC queries
async function trpcQuery(
  procedure: string,
  input?: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  let url = `${BASE_URL}/trpc/${procedure}`;
  if (input !== undefined) {
    url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
  }
  const response = await fetch(url, { headers });
  return response;
}

// Parse tRPC response
interface TRPCResponse {
  result?: { data: unknown };
  error?: { message: string; code: string };
}

interface ParsedResult {
  data: unknown;
  error: string | undefined;
}

async function parseTRPC(response: Response): Promise<ParsedResult> {
  const json = (await response.json()) as TRPCResponse;
  if (json.result !== undefined) {
    return { data: json.result.data, error: undefined };
  }
  if (json.error !== undefined) {
    return { data: undefined, error: json.error.message };
  }
  return { data: undefined, error: undefined };
}

// Type guard helpers
function hasStringProp(obj: unknown, prop: string): obj is Record<string, unknown> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    prop in obj &&
    typeof (obj as Record<string, unknown>)[prop] === 'string'
  );
}

function hasAccessToken(obj: unknown): obj is { accessToken: string } {
  return hasStringProp(obj, 'accessToken') && (obj as { accessToken: string }).accessToken !== '';
}

function hasId(obj: unknown): obj is { id: string } {
  return hasStringProp(obj, 'id') && (obj as { id: string }).id !== '';
}

function hasStatus(obj: unknown): obj is { status: string } {
  return hasStringProp(obj, 'status');
}

function hasUserEmail(obj: unknown): obj is { user: { email: string } } {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (typeof o.user !== 'object' || o.user === null) return false;
  const user = o.user as Record<string, unknown>;
  return typeof user.email === 'string';
}

function hasHosts(obj: unknown): obj is { hosts: unknown[] } {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return Array.isArray(o.hosts);
}

// Global test timeout
const TIMEOUT = setTimeout((): void => {
  console.error('\n❌ Integration tests timed out!');
  process.exit(1);
}, 60000);
TIMEOUT.unref();

await describe('Integration Tests (tRPC)', async () => {
  before(async () => {
    await resetDb();
    PORT = await getAvailablePort();
    BASE_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);
    const { app } = await import('../src/server.js');
    server = app.listen(PORT);
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log(`Integration test server started on port ${String(PORT)}`);
  });

  after(async () => {
    if (server !== undefined) {
      server.close();
      console.log('Integration test server closed');
    }
    await closeConnection();
  });

  await describe('User Workflow', async () => {
    await it('should complete user registration → login → profile access flow', async () => {
      // Step 1: Register a new user with unique email
      const registerRes = await trpcMutate('auth.register', {
        email: INTEGRATION_EMAIL,
        password: 'IntegrationTest123!',
        name: 'Integration Test User',
      });

      assert.strictEqual(registerRes.status, 200, 'Registration should succeed');

      // Step 2: Login with credentials
      const loginRes = await trpcMutate('auth.login', {
        email: INTEGRATION_EMAIL,
        password: 'IntegrationTest123!',
      });

      assert.strictEqual(loginRes.status, 200, 'Login should succeed');
      const loginResult = await parseTRPC(loginRes);
      assert.ok(hasAccessToken(loginResult.data), 'Login should return access token');
      const accessToken = loginResult.data.accessToken;

      // Step 3: Access profile with token
      const profileRes = await trpcQuery('auth.me', undefined, {
        Authorization: `Bearer ${accessToken}`,
      });

      assert.strictEqual(profileRes.status, 200, 'Profile access should succeed');
      const profileResult = await parseTRPC(profileRes);
      assert.ok(hasUserEmail(profileResult.data), 'Profile should contain user email');
      assert.strictEqual(profileResult.data.user.email, INTEGRATION_EMAIL);
    });
  });

  await describe('Health Report Flow', async () => {
    await it('should complete health report submission → retrieval flow', async () => {
      const testHostname = 'test-machine-' + String(Date.now());

      // Step 1: Submit health report via tRPC
      const reportRes = await trpcMutate(
        'healthReports.submit',
        {
          hostname: testHostname,
          status: 'healthy',
          version: '3.5',
        },
        {
          Authorization: `Bearer ${SHARED_SECRET}`,
        }
      );

      assert.ok(
        [200, 201].includes(reportRes.status),
        `Health report submission should succeed, got ${String(reportRes.status)}`
      );

      // Step 2: Retrieve reports as admin
      const listRes = await trpcQuery('healthReports.list', undefined, {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
      });

      assert.strictEqual(listRes.status, 200, 'Should retrieve health reports');
      const listResult = await parseTRPC(listRes);
      assert.ok(hasHosts(listResult.data), 'Response should contain hosts array');
    });
  });

  await describe('Classroom Management Flow', async () => {
    await it('should complete classroom create → get → delete flow', async () => {
      // Step 1: Create classroom
      const createRes = await trpcMutate(
        'classrooms.create',
        {
          name: 'Integration Test Lab ' + String(Date.now()),
          description: 'Test classroom for integration testing',
        },
        {
          Authorization: `Bearer ${ADMIN_TOKEN}`,
        }
      );

      assert.ok(
        [200, 201].includes(createRes.status),
        `Classroom creation should succeed, got ${String(createRes.status)}`
      );
      const createResult = await parseTRPC(createRes);
      assert.ok(hasId(createResult.data), 'Response should contain classroom ID');
      const classroomId = createResult.data.id;

      // Step 2: Get classroom details
      const getRes = await trpcQuery(
        'classrooms.get',
        { id: classroomId },
        {
          Authorization: `Bearer ${ADMIN_TOKEN}`,
        }
      );

      assert.strictEqual(getRes.status, 200, 'Classroom retrieval should succeed');

      // Step 3: Delete classroom
      const deleteRes = await trpcMutate(
        'classrooms.delete',
        { id: classroomId },
        {
          Authorization: `Bearer ${ADMIN_TOKEN}`,
        }
      );

      assert.strictEqual(deleteRes.status, 200, 'Classroom deletion should succeed');
    });
  });

  await describe('Domain Request Workflow', async () => {
    await it('should complete domain request → review → decision flow', async () => {
      // Step 1: Submit domain request (public)
      const submitRes = await trpcMutate('requests.create', {
        domain: 'integration-test-' + String(Date.now()) + '.example.com',
        reason: 'Integration test request',
        requesterEmail: 'student@test.com',
      });

      assert.strictEqual(submitRes.status, 200, 'Request submission should succeed');
      const submitResult = await parseTRPC(submitRes);
      assert.ok(hasId(submitResult.data), 'Response should contain request ID');
      const requestId = submitResult.data.id;

      // Step 2: List requests as admin
      const listRes = await trpcQuery(
        'requests.list',
        {},
        {
          Authorization: `Bearer ${ADMIN_TOKEN}`,
        }
      );

      assert.strictEqual(listRes.status, 200, 'Request listing should succeed');
      const listResult = await parseTRPC(listRes);
      assert.ok(Array.isArray(listResult.data), 'Response should contain requests array');

      // Step 3: Get request status
      const getRes = await trpcQuery('requests.getStatus', { id: requestId });

      assert.strictEqual(getRes.status, 200, 'Request retrieval should succeed');
      const statusResult = await parseTRPC(getRes);
      assert.ok(hasStatus(statusResult.data), 'Response should contain status');
      assert.strictEqual(statusResult.data.status, 'pending');

      // Step 4: Reject the request
      const rejectRes = await trpcMutate(
        'requests.reject',
        {
          id: requestId,
          reason: 'Integration test rejection',
        },
        {
          Authorization: `Bearer ${ADMIN_TOKEN}`,
        }
      );

      assert.strictEqual(rejectRes.status, 200, 'Request rejection should succeed');
    });
  });
});

console.log('Running Integration Tests...');
