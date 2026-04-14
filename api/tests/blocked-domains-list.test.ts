import { after, before, describe, test } from 'node:test';
import assert from 'node:assert';

import type { BlockedDomainsTestHarness } from './blocked-domains-test-harness.js';
import { startBlockedDomainsTestHarness } from './blocked-domains-test-harness.js';
import { assertStatus, bearerAuth, parseTRPC } from './test-utils.js';

let harness: BlockedDomainsTestHarness | undefined;

function getHarness(): BlockedDomainsTestHarness {
  assert.ok(harness, 'Blocked domains harness should be initialized');
  return harness;
}

void describe('Blocked domains - requests.listBlocked', () => {
  before(async () => {
    harness = await startBlockedDomainsTestHarness();
  });

  after(async () => {
    await harness?.close();
    harness = undefined;
  });

  void test('returns blocked domains for admin', async (): Promise<void> => {
    const response = await getHarness().trpcQuery(
      'requests.listBlocked',
      { groupId: getHarness().teacherGroupId },
      bearerAuth(getHarness().adminToken)
    );

    assertStatus(response, 200);
    const payload = (await parseTRPC(response)) as { data?: string[] };
    assert.ok(Array.isArray(payload.data));
  });

  void test('rejects blocked-domain listing for teachers', async (): Promise<void> => {
    const response = await getHarness().trpcQuery(
      'requests.listBlocked',
      { groupId: getHarness().teacherGroupId },
      bearerAuth(getHarness().teacherToken)
    );

    assert.strictEqual(response.status, 403);
  });

  void test('rejects blocked-domain listing without authentication', async (): Promise<void> => {
    const response = await getHarness().trpcQuery('requests.listBlocked');
    assert.strictEqual(response.status, 401);
  });
});
