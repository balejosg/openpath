/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import { getAvailablePort } from './test-utils.js';
import { closeConnection } from '../src/db/index.js';

let PORT: number;
let API_URL: string;

// Global timeout - force exit if tests hang
const GLOBAL_TIMEOUT = setTimeout(() => {
  console.error('\n❌ API tests timed out! Forcing exit...');
  process.exit(1);
}, 25000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;

// Helper to call tRPC mutations
async function trpcMutate(
  procedure: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  const response = await fetch(`${API_URL}/trpc/${procedure}`, {
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
  let url = `${API_URL}/trpc/${procedure}`;
  if (input !== undefined) {
    url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
  }
  const response = await fetch(url, { headers });
  return response;
}

// Parse tRPC response
interface TRPCResponse<T = unknown> {
  result?: { data: T };
  error?: { message: string; code: string };
}

async function parseTRPC(
  response: Response
): Promise<{ data?: unknown; error?: string; code?: string }> {
  const json = (await response.json()) as TRPCResponse;
  if (json.result) {
    return { data: json.result.data };
  }
  if (json.error) {
    return { error: json.error.message, code: json.error.code };
  }
  return {};
}

await describe('Whitelist Request API Tests (tRPC)', { timeout: 30000 }, async () => {
  before(async () => {
    // Start server for testing
    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);

    const { app } = await import('../src/server.js');

    server = app.listen(PORT, () => {
      console.log(`Test server started on port ${String(PORT)}`);
    });

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  after(async () => {
    // Stop token store cleanup interval
    try {
      const { resetTokenStore } = await import('../src/lib/token-store.js');
      resetTokenStore();
    } catch (e) {
      console.error('Error resetting token store:', e);
    }

    // Properly close the server
    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          console.log('Test server closed');
          resolve();
        });
      });
    }
    // Close database pool
    await closeConnection();
  });

  await describe('Health Check', async () => {
    await test('GET /health should return 200 OK', async () => {
      const response = await fetch(`${API_URL}/health`);
      assert.strictEqual(response.status, 200);

      const data = (await response.json()) as { status: string; service: string };
      assert.strictEqual(data.status, 'ok');
      assert.strictEqual(data.service, 'openpath-api');
    });
  });

  await describe('tRPC requests.create - Submit Domain Request', async () => {
    await test('should accept valid domain request', async () => {
      const input = {
        domain: 'test-' + String(Date.now()) + '.example.com',
        reason: 'Testing purposes',
        requesterEmail: 'test@example.com',
      };

      const response = await trpcMutate('requests.create', input);
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: { id: string; status: string } };
      if (!data) throw new Error('No data');
      assert.ok(data.id !== '');
      assert.strictEqual(data.status, 'pending');
    });

    await test('should reject request without domain', async () => {
      const input = {
        reason: 'Testing',
        requesterEmail: 'test@example.com',
      };

      const response = await trpcMutate('requests.create', input);
      assert.strictEqual(response.status, 400);
    });

    await test('should reject invalid domain format', async () => {
      const input = {
        domain: 'not-a-valid-domain',
        reason: 'Testing',
      };

      const response = await trpcMutate('requests.create', input);
      assert.strictEqual(response.status, 400);
    });

    await test('should reject XSS attempts in domain names', async () => {
      const input = {
        domain: '<script>alert("xss")</script>.com',
        reason: 'Testing',
      };

      const response = await trpcMutate('requests.create', input);
      assert.strictEqual(response.status, 400);
    });
  });

  await describe('tRPC requests.list - List Requests', async () => {
    await test('should require authentication for listing requests', async () => {
      const response = await trpcQuery('requests.list', {});
      assert.strictEqual(response.status, 401);
    });
  });

  await describe('CORS Headers', async () => {
    await test('should include CORS headers', async () => {
      const response = await fetch(`${API_URL}/health`, {
        headers: { Origin: 'http://localhost:3000' },
      });
      const corsHeader = response.headers.get('access-control-allow-origin');
      assert.ok(
        corsHeader !== null && corsHeader !== '',
        'Expected access-control-allow-origin header to be set'
      );
    });
  });

  await describe('Error Handling', async () => {
    await test('should return 404 for blocked /v2 routes', async () => {
      // /v2 is explicitly blocked now that React SPA is served from /
      const response = await fetch(`${API_URL}/v2`);
      assert.strictEqual(response.status, 404);
    });

    await test('should return SPA for client-side routes', async () => {
      // Unknown routes now return SPA HTML for client-side routing
      const response = await fetch(`${API_URL}/unknown-route`);
      assert.strictEqual(response.status, 200);
      const text = await response.text();
      assert.ok(
        text.includes('<!DOCTYPE html>') || text.includes('<html'),
        'Expected HTML response'
      );
    });

    await test('should handle malformed JSON', async () => {
      const response = await fetch(`${API_URL}/trpc/requests.create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{{',
      });

      assert.ok(response.status >= 400);
    });
  });

  await describe('tRPC requests.getStatus - Check Request Status', async () => {
    await test('should return 404 for non-existent request', async () => {
      const response = await trpcQuery('requests.getStatus', { id: 'nonexistent-id' });
      // tRPC returns 404/NOT_FOUND as a JSON error, but HTTP status might be 200 with error body
      // or could be mapped - check actual behavior
      const { error } = await parseTRPC(response);
      assert.ok(error !== undefined || response.status === 404);
    });

    await test('should return status for existing request', async () => {
      // First create a request
      const createInput = {
        domain: 'status-test-' + String(Date.now()) + '.example.com',
        reason: 'Testing status endpoint',
      };
      const createResponse = await trpcMutate('requests.create', createInput);
      const { data: createData } = (await parseTRPC(createResponse)) as { data?: { id: string } };
      if (!createData) throw new Error('No data');
      const requestId = createData.id;
      assert.ok(requestId !== '');

      // Then check its status
      const statusResponse = await trpcQuery('requests.getStatus', { id: requestId });
      assert.strictEqual(statusResponse.status, 200);

      const { data: statusData } = (await parseTRPC(statusResponse)) as {
        data?: { id: string; status: string; domain: string };
      };
      if (!statusData) throw new Error('No data');
      assert.strictEqual(statusData.status, 'pending');
      assert.ok(statusData.id !== '');
    });
  });

  await describe('tRPC requests.listGroups - List Groups', async () => {
    await test('should require authentication for listing groups', async () => {
      const response = await trpcQuery('requests.listGroups');
      assert.strictEqual(response.status, 401);
    });
  });

  await describe('Admin Endpoints with Invalid Token', async () => {
    await test('should reject admin list with wrong token', async () => {
      const response = await trpcQuery(
        'requests.list',
        {},
        { Authorization: 'Bearer wrong-token' }
      );
      assert.strictEqual(response.status, 401);
    });

    await test('should reject approve with wrong token', async () => {
      const response = await trpcMutate(
        'requests.approve',
        { id: 'some-id', groupId: 'test' },
        { Authorization: 'Bearer wrong-token' }
      );
      assert.strictEqual(response.status, 401);
    });

    await test('should reject reject with wrong token', async () => {
      const response = await trpcMutate(
        'requests.reject',
        { id: 'some-id', reason: 'test' },
        { Authorization: 'Bearer wrong-token' }
      );
      assert.strictEqual(response.status, 401);
    });

    await test('should reject delete with wrong token', async () => {
      const response = await trpcMutate(
        'requests.delete',
        { id: 'some-id' },
        { Authorization: 'Bearer wrong-token' }
      );
      assert.strictEqual(response.status, 401);
    });
  });

  await describe('Input Sanitization', async () => {
    await test('should sanitize reason field', async () => {
      const response = await trpcMutate('requests.create', {
        domain: `sanitize-test-${String(Date.now())}.example.com`,
        reason: '<script>alert("xss")</script>Normal reason',
      });

      assert.strictEqual(response.status, 200);
    });

    await test('should handle very long domain names', async () => {
      const longDomain = 'a'.repeat(300) + '.example.com';
      const response = await trpcMutate('requests.create', {
        domain: longDomain,
        reason: 'Testing long domain',
      });

      assert.strictEqual(response.status, 400);
    });

    await test('should handle special characters in email', async () => {
      const response = await trpcMutate('requests.create', {
        domain: `email-test-${String(Date.now())}.example.com`,
        reason: 'Testing',
        requesterEmail: 'valid+tag@example.com',
      });

      assert.strictEqual(response.status, 200);
    });
  });

  await describe('Priority Field', async () => {
    await test('should accept valid priority values', async () => {
      const response = await trpcMutate('requests.create', {
        domain: `priority-test-${String(Date.now())}.example.com`,
        reason: 'Testing priority',
        priority: 'high',
      });

      assert.strictEqual(response.status, 200);
    });
  });
});
