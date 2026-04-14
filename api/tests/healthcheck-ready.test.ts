import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseTRPC, registerHealthcheckLifecycle, trpcQuery } from './healthcheck-test-harness.js';

registerHealthcheckLifecycle();

await describe('healthcheck.ready', async () => {
  await test('returns readiness status with checks', async () => {
    const response = await trpcQuery('healthcheck.ready');
    assert.equal(response.status, 200);

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
    assert.equal(data.service, 'openpath-api');
    assert.equal(typeof data.uptime, 'number', 'Uptime should be a number');
    assert.ok('checks' in data, 'Expected checks object');
    assert.ok('responseTime' in data, 'Expected responseTime');
  });

  await test('does not treat legacy ADMIN_TOKEN as auth configuration', async () => {
    const previousAdminToken = process.env.ADMIN_TOKEN;
    const previousJwtSecret = process.env.JWT_SECRET;

    process.env.ADMIN_TOKEN = 'legacy-admin-token';
    delete process.env.JWT_SECRET;

    try {
      const response = await trpcQuery('healthcheck.ready');
      assert.equal(response.status, 200);

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
      assert.equal(data.checks.auth?.status, 'not_configured');
      assert.equal(data.status, 'degraded');
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
