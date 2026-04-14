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

interface PushResult {
  success?: boolean;
  subscriptions?: { endpoint?: string }[];
}

registerPushLifecycle();

void describe('Push Notifications API - unsubscribe flows', { timeout: 45_000 }, () => {
  void test('push.unsubscribe removes the subscription from push status', async () => {
    const subscription = createMockSubscription('unsubscribe');

    const subscribeResponse = await trpcMutate(
      'push.subscribe',
      {
        subscription,
        groupIds: ['ciencias-3eso'],
      },
      { Authorization: `Bearer ${getPushScenario().teacherToken}` }
    );
    assert.equal(subscribeResponse.status, 200);

    const unsubscribeResponse = await trpcMutate(
      'push.unsubscribe',
      { endpoint: subscription.endpoint },
      { Authorization: `Bearer ${getPushScenario().teacherToken}` }
    );
    assert.equal(unsubscribeResponse.status, 200);

    const unsubscribeResult = await parseTRPC(unsubscribeResponse);
    const unsubscribeData = unsubscribeResult.data as PushResult;
    assert.equal(unsubscribeData.success, true);

    const statusResponse = await trpcQuery('push.getStatus', undefined, {
      Authorization: `Bearer ${getPushScenario().teacherToken}`,
    });
    assert.equal(statusResponse.status, 200);

    const statusResult = await parseTRPC(statusResponse);
    const statusData = statusResult.data as PushResult;
    assert.equal(
      statusData.subscriptions?.some(({ endpoint }) => endpoint === subscription.endpoint),
      false
    );
  });
});
