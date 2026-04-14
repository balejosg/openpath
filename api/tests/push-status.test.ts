import { describe, test } from 'node:test';

import assert from 'node:assert/strict';

import {
  createMockSubscription,
  getPushScenario,
  parseTRPC,
  registerPushLifecycle,
  trpcMutate,
  trpcQuery,
} from './push-test-harness.js';

interface PushSubscriptionRecord {
  endpoint?: string;
}

interface PushStatusResult {
  pushEnabled?: boolean;
  subscriptions?: PushSubscriptionRecord[];
}

registerPushLifecycle();

void describe('Push Notifications API - status flows', { timeout: 45_000 }, () => {
  void test('push.getStatus reports active subscriptions for the authenticated teacher', async () => {
    const subscription = createMockSubscription('status-check');

    const subscribeResponse = await trpcMutate(
      'push.subscribe',
      {
        subscription,
        groupIds: ['ciencias-3eso', 'fisica-4eso'],
      },
      { Authorization: `Bearer ${getPushScenario().teacherToken}` }
    );
    assert.equal(subscribeResponse.status, 200);

    const statusResponse = await trpcQuery('push.getStatus', undefined, {
      Authorization: `Bearer ${getPushScenario().teacherToken}`,
    });
    assert.equal(statusResponse.status, 200);

    const result = await parseTRPC(statusResponse);
    const data = result.data as PushStatusResult;

    assert.equal(data.pushEnabled, true);
    assert.equal(Array.isArray(data.subscriptions), true);
  });
});
