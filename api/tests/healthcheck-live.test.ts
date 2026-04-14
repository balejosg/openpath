import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseTRPC, registerHealthcheckLifecycle, trpcQuery } from './healthcheck-test-harness.js';

registerHealthcheckLifecycle();

await describe('healthcheck.live', async () => {
  await test('returns alive status with timestamp', async () => {
    const response = await trpcQuery('healthcheck.live');
    assert.equal(response.status, 200);

    const { data } = (await parseTRPC(response)) as {
      data?: { status: string; timestamp: string };
    };

    assert.ok(data !== undefined, 'Expected data in response');
    assert.equal(data.status, 'alive');
    assert.ok(data.timestamp, 'Expected timestamp');
    assert.ok(!Number.isNaN(Date.parse(data.timestamp)), 'Timestamp should be valid ISO date');
  });
});
