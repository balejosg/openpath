import { describe, test } from 'node:test';

import assert from 'node:assert/strict';

import {
  createMockSubscription,
  getPushScenario,
  parseTRPC,
  registerPushLifecycle,
  trpcMutate,
} from './push-test-harness.js';

interface PushResult {
  groupIds?: string[];
  subscriptionId?: string;
}

registerPushLifecycle();

void describe('Push Notifications API - subscription flows', { timeout: 45_000 }, () => {
  void test('push.subscribe stores a teacher subscription for assigned groups', async () => {
    const response = await trpcMutate(
      'push.subscribe',
      {
        subscription: createMockSubscription('teacher-subscribe'),
        groupIds: ['ciencias-3eso', 'fisica-4eso'],
      },
      { Authorization: `Bearer ${getPushScenario().teacherToken}` }
    );

    assert.equal(response.status, 200);

    const result = await parseTRPC(response);
    const data = result.data as PushResult;

    assert.ok(data.subscriptionId);
    assert.equal(data.groupIds?.includes('ciencias-3eso'), true);
  });

  void test('push.subscribe rejects unknown groups', async () => {
    const response = await trpcMutate(
      'push.subscribe',
      {
        subscription: createMockSubscription('invalid-group'),
        groupIds: ['missing-group-id'],
      },
      { Authorization: `Bearer ${getPushScenario().teacherToken}` }
    );

    assert.equal(response.status, 400);
  });
});
