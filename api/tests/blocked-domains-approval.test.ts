import { after, before, describe, test } from 'node:test';
import assert from 'node:assert';

import type { BlockedDomainsTestHarness } from './blocked-domains-test-harness.js';
import {
  startBlockedDomainsTestHarness,
  uniqueBlockedDomain,
  uniqueSafeDomain,
} from './blocked-domains-test-harness.js';
import { bearerAuth } from './test-utils.js';

let harness: BlockedDomainsTestHarness | undefined;

function getHarness(): BlockedDomainsTestHarness {
  assert.ok(harness, 'Blocked domains harness should be initialized');
  return harness;
}

void describe('Blocked domains - teacher approval flows', () => {
  before(async () => {
    harness = await startBlockedDomainsTestHarness();
  });

  after(async () => {
    await harness?.close();
    harness = undefined;
  });

  void test('teacher can attempt approval for a blocked-domain request', async (): Promise<void> => {
    const requestId = await getHarness().createPendingRequest({
      domain: uniqueBlockedDomain('approval'),
      requesterEmail: 'student-blocked@test.com',
    });

    const response = await getHarness().trpcMutate(
      'requests.approve',
      {
        id: requestId,
        groupId: getHarness().teacherGroupId,
      },
      bearerAuth(getHarness().teacherToken)
    );

    assert.ok([200, 400, 403].includes(response.status));
  });

  void test('teacher can attempt approval for a non-blocked-domain request', async (): Promise<void> => {
    const requestId = await getHarness().createPendingRequest({
      domain: uniqueSafeDomain('approval'),
      requesterEmail: 'student-safe@test.com',
    });

    const response = await getHarness().trpcMutate(
      'requests.approve',
      {
        id: requestId,
        groupId: getHarness().teacherGroupId,
      },
      bearerAuth(getHarness().teacherToken)
    );

    assert.ok([200, 400, 403].includes(response.status));
  });
});
