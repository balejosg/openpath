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
import { getAvailablePort, trpcQuery, parseTRPC } from './test-utils.js';
import { closeConnection } from '../src/db/index.js';

let PORT: number;
let API_URL: string;

// Global timeout - force exit if tests hang
const GLOBAL_TIMEOUT = setTimeout(() => {
  console.error('\n❌ Healthcheck tests timed out! Forcing exit...');
  process.exit(1);
}, 25000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;

await describe('Healthcheck Router Tests', { timeout: 30000 }, async () => {
  before(async () => {
    // Start server for testing
    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);

    const { app } = await import('../src/server.js');

    server = app.listen(PORT, () => {
      console.log(`Healthcheck test server started on port ${String(PORT)}`);
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
          console.log('Healthcheck test server closed');
          resolve();
        });
      });
    }
    // Close database pool
    await closeConnection();
  });

  await describe('healthcheck.live', async () => {
    await test('should return alive status with timestamp', async () => {
      const response = await trpcQuery(API_URL, 'healthcheck.live');
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as {
        data?: { status: string; timestamp: string };
      };
      assert.ok(data !== undefined, 'Expected data in response');
      assert.strictEqual(data.status, 'alive');
      assert.ok(data.timestamp, 'Expected timestamp');
      // Validate timestamp is ISO format
      assert.ok(!isNaN(Date.parse(data.timestamp)), 'Timestamp should be valid ISO date');
    });
  });

  await describe('healthcheck.ready', async () => {
    await test('should return readiness status with checks', async () => {
      const response = await trpcQuery(API_URL, 'healthcheck.ready');
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as {
        data?: {
          status: string;
          service: string;
          uptime: number;
          checks: Record<string, unknown>;
          responseTime: string;
        };
      };
      assert.ok(data !== undefined, 'Expected data in response');
      assert.ok(['ok', 'degraded'].includes(data.status), 'Status should be ok or degraded');
      assert.strictEqual(data.service, 'openpath-api');
      assert.ok(typeof data.uptime === 'number', 'Uptime should be a number');
      assert.ok('checks' in data, 'Expected checks object');
      assert.ok('responseTime' in data, 'Expected responseTime');
    });

    await test('should not treat legacy ADMIN_TOKEN as auth configuration', async () => {
      const previousAdminToken = process.env.ADMIN_TOKEN;
      const previousJwtSecret = process.env.JWT_SECRET;
      process.env.ADMIN_TOKEN = 'legacy-admin-token';
      delete process.env.JWT_SECRET;

      try {
        const response = await trpcQuery(API_URL, 'healthcheck.ready');
        assert.strictEqual(response.status, 200);

        const { data } = (await parseTRPC(response)) as {
          data?: {
            status: string;
            checks: {
              auth?: {
                status: string;
              };
            };
          };
        };

        assert.ok(data !== undefined, 'Expected data in response');
        assert.strictEqual(data.checks.auth?.status, 'not_configured');
        assert.strictEqual(data.status, 'degraded');
      } finally {
        if (previousAdminToken === undefined) {
          delete process.env.ADMIN_TOKEN;
        } else {
          process.env.ADMIN_TOKEN = previousAdminToken;
        }

        if (previousJwtSecret === undefined) {
          delete process.env.JWT_SECRET;
        } else {
          process.env.JWT_SECRET = previousJwtSecret;
        }
      }
    });
  });

  await describe('healthcheck.systemInfo', async () => {
    await test('should be removed from the public surface', async () => {
      const response = await trpcQuery(API_URL, 'healthcheck.systemInfo');
      assert.strictEqual(response.status, 404);
    });
  });
});
