import { after, before, describe, test } from 'node:test';
import assert from 'node:assert';

import type { BlockedDomainsTestHarness } from './blocked-domains-test-harness.js';
import { startBlockedDomainsTestHarness } from './blocked-domains-test-harness.js';
import { assertStatus, bearerAuth, parseTRPC } from './test-utils.js';

interface CheckResult {
  blocked: boolean;
}

let harness: BlockedDomainsTestHarness | undefined;

function getHarness(): BlockedDomainsTestHarness {
  assert.ok(harness, 'Blocked domains harness should be initialized');
  return harness;
}

void describe('Blocked domains - requests.check', () => {
  before(async () => {
    harness = await startBlockedDomainsTestHarness();
  });

  after(async () => {
    await harness?.close();
    harness = undefined;
  });

  void test('returns blocked status for facebook.com', async (): Promise<void> => {
    const response = await getHarness().trpcMutate(
      'requests.check',
      { domain: 'facebook.com', groupId: getHarness().teacherGroupId },
      bearerAuth(getHarness().teacherToken)
    );

    assertStatus(response, 200);
    const payload = (await parseTRPC(response)) as { data?: CheckResult };
    assert.strictEqual(typeof payload.data?.blocked, 'boolean');
  });

  void test('returns blocked status for wikipedia.org', async (): Promise<void> => {
    const response = await getHarness().trpcMutate(
      'requests.check',
      { domain: 'wikipedia.org', groupId: getHarness().teacherGroupId },
      bearerAuth(getHarness().teacherToken)
    );

    assertStatus(response, 200);
    const payload = (await parseTRPC(response)) as { data?: CheckResult };
    assert.strictEqual(typeof payload.data?.blocked, 'boolean');
  });

  void test('rejects checks without authentication', async (): Promise<void> => {
    const response = await getHarness().trpcMutate('requests.check', {
      domain: 'example.com',
      groupId: getHarness().teacherGroupId,
    });

    assert.strictEqual(response.status, 401);
  });

  void test('rejects checks without domain parameter', async (): Promise<void> => {
    const response = await getHarness().trpcMutate(
      'requests.check',
      { groupId: getHarness().teacherGroupId },
      bearerAuth(getHarness().teacherToken)
    );

    assert.strictEqual(response.status, 400);
  });
});
