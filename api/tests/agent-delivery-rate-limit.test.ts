import assert from 'node:assert';
import { after, describe, test } from 'node:test';

import { startHttpTestHarness, type HttpTestHarness } from './http-test-harness.js';

let harness: HttpTestHarness | undefined;

async function getHarness(): Promise<HttpTestHarness> {
  harness ??= await startHttpTestHarness({
    env: {
      ENABLE_RATE_LIMIT_IN_TEST: 'true',
      JWT_SECRET: 'test-agent-delivery-rate-limit-secret',
      NODE_ENV: 'development',
      RATE_LIMIT_MAX: '1',
      RATE_LIMIT_WINDOW_MS: '60000',
      TRUST_PROXY: '1',
    },
    readyDelayMs: 100,
    resetDb: true,
  });

  return harness;
}

after(async () => {
  await harness?.close();
  harness = undefined;
});

void describe('agent delivery rate limits', () => {
  void test('agent delivery routes are not consumed by the global bucket', async () => {
    const runtime = await getHarness();
    const callerHeaders = { 'X-Forwarded-For': '198.51.100.220' };

    const firstGenericResponse = await fetch(`${runtime.apiUrl}/api/config`, {
      headers: callerHeaders,
    });
    assert.notStrictEqual(firstGenericResponse.status, 429);

    const secondGenericResponse = await fetch(`${runtime.apiUrl}/api/config`, {
      headers: callerHeaders,
    });
    assert.strictEqual(secondGenericResponse.status, 429);

    const agentDeliveryResponse = await fetch(`${runtime.apiUrl}/api/agent/windows/manifest`, {
      headers: callerHeaders,
    });

    assert.notStrictEqual(agentDeliveryResponse.status, 429);
    assert.ok(
      [401, 403].includes(agentDeliveryResponse.status),
      `agent delivery should reach auth handling, got ${String(agentDeliveryResponse.status)}`
    );
  });
});
