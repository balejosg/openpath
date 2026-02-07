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

// Expected version from package.json
const EXPECTED_VERSION = '1.0.4';

// Response type for systemInfo endpoint
interface SystemInfoResponse {
  version: string;
  database: {
    connected: boolean;
    type: string;
  };
  session: {
    accessTokenExpiry: string;
    accessTokenExpiryHuman: string;
    refreshTokenExpiry: string;
    refreshTokenExpiryHuman: string;
  };
  backup: {
    lastBackupAt: string | null;
    lastBackupHuman: string | null;
    lastBackupStatus: 'success' | 'failed' | null;
  };
  uptime: number;
}

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
  });

  await describe('healthcheck.systemInfo', async () => {
    await test('should return version from package.json', async () => {
      const response = await trpcQuery(API_URL, 'healthcheck.systemInfo');
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: SystemInfoResponse };
      assert.ok(data !== undefined, 'Expected data in response');
      assert.strictEqual(data.version, EXPECTED_VERSION, `Version should be ${EXPECTED_VERSION}`);
    });

    await test('should return database connection status', async () => {
      const response = await trpcQuery(API_URL, 'healthcheck.systemInfo');
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: SystemInfoResponse };
      assert.ok(data !== undefined, 'Expected data in response');
      assert.ok('database' in data, 'Expected database object');
      assert.strictEqual(typeof data.database.connected, 'boolean', 'connected should be boolean');
      assert.strictEqual(data.database.type, 'PostgreSQL', 'Database type should be PostgreSQL');
    });

    await test('should return database as connected when DB is available', async () => {
      const response = await trpcQuery(API_URL, 'healthcheck.systemInfo');
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: SystemInfoResponse };
      assert.ok(data !== undefined, 'Expected data in response');
      // In test environment with DB running, should be connected
      assert.strictEqual(data.database.connected, true, 'Database should be connected in test env');
    });

    await test('should return session configuration values', async () => {
      const response = await trpcQuery(API_URL, 'healthcheck.systemInfo');
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: SystemInfoResponse };
      assert.ok(data !== undefined, 'Expected data in response');
      assert.ok('session' in data, 'Expected session object');

      // Access token expiry
      assert.ok(
        typeof data.session.accessTokenExpiry === 'string',
        'accessTokenExpiry should be string'
      );
      assert.ok(
        typeof data.session.accessTokenExpiryHuman === 'string',
        'accessTokenExpiryHuman should be string'
      );

      // Refresh token expiry
      assert.ok(
        typeof data.session.refreshTokenExpiry === 'string',
        'refreshTokenExpiry should be string'
      );
      assert.ok(
        typeof data.session.refreshTokenExpiryHuman === 'string',
        'refreshTokenExpiryHuman should be string'
      );
    });

    await test('should return human-readable expiry format in Spanish', async () => {
      const response = await trpcQuery(API_URL, 'healthcheck.systemInfo');
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: SystemInfoResponse };
      assert.ok(data !== undefined, 'Expected data in response');

      // Human-readable should contain Spanish time units
      const spanishTimeUnits = ['segundo', 'minuto', 'hora', 'día'];
      const hasSpanishUnit = spanishTimeUnits.some(
        (unit) =>
          data.session.accessTokenExpiryHuman.includes(unit) ||
          data.session.refreshTokenExpiryHuman.includes(unit)
      );
      assert.ok(hasSpanishUnit, 'Human-readable expiry should contain Spanish time units');
    });

    await test('should return uptime as positive number', async () => {
      const response = await trpcQuery(API_URL, 'healthcheck.systemInfo');
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: SystemInfoResponse };
      assert.ok(data !== undefined, 'Expected data in response');
      assert.ok(typeof data.uptime === 'number', 'Uptime should be a number');
      assert.ok(data.uptime > 0, 'Uptime should be positive');
    });

    await test('should be accessible without authentication (public endpoint)', async () => {
      // No auth headers provided
      const response = await trpcQuery(API_URL, 'healthcheck.systemInfo');
      assert.strictEqual(response.status, 200, 'Should be accessible without auth');

      const { data, error } = (await parseTRPC(response)) as {
        data?: SystemInfoResponse;
        error?: string;
      };
      assert.ok(error === undefined, 'Should not return auth error');
      assert.ok(data !== undefined, 'Should return data');
    });

    await test('should return consistent response structure', async () => {
      const response = await trpcQuery(API_URL, 'healthcheck.systemInfo');
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: SystemInfoResponse };
      assert.ok(data !== undefined, 'Expected data in response');

      // Verify all expected keys exist
      const expectedKeys = ['version', 'database', 'session', 'uptime'];
      for (const key of expectedKeys) {
        assert.ok(key in data, `Response should contain ${key}`);
      }

      // Verify database structure
      assert.ok('connected' in data.database, 'database should have connected');
      assert.ok('type' in data.database, 'database should have type');

      // Verify session structure
      const sessionKeys = [
        'accessTokenExpiry',
        'accessTokenExpiryHuman',
        'refreshTokenExpiry',
        'refreshTokenExpiryHuman',
      ];
      for (const key of sessionKeys) {
        assert.ok(key in data.session, `session should contain ${key}`);
      }
    });
  });
});
