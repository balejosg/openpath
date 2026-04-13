import { describe, test } from 'node:test';
import assert from 'node:assert';

import { registerRequestApiLifecycle, trpcMutate, trpcQuery } from './request-api-test-harness.js';

registerRequestApiLifecycle();

void describe('Request API tests - request authorization guards', async () => {
  await describe('tRPC requests.list - List Requests', async () => {
    await test('should require authentication for listing requests', async () => {
      const response = await trpcQuery('requests.list', {});
      assert.strictEqual(response.status, 401);
    });
  });

  await describe('tRPC requests.listGroups - List Groups', async () => {
    await test('should require authentication for listing groups', async () => {
      const response = await trpcQuery('requests.listGroups');
      assert.strictEqual(response.status, 401);
    });
  });

  await describe('Admin Endpoints with Invalid Token', async () => {
    await test('should reject admin list with wrong token', async () => {
      const response = await trpcQuery(
        'requests.list',
        {},
        { Authorization: 'Bearer wrong-token' }
      );
      assert.strictEqual(response.status, 401);
    });

    await test('should reject approve with wrong token', async () => {
      const response = await trpcMutate(
        'requests.approve',
        { id: 'some-id', groupId: 'test' },
        { Authorization: 'Bearer wrong-token' }
      );
      assert.strictEqual(response.status, 401);
    });

    await test('should reject reject with wrong token', async () => {
      const response = await trpcMutate(
        'requests.reject',
        { id: 'some-id', reason: 'test' },
        { Authorization: 'Bearer wrong-token' }
      );
      assert.strictEqual(response.status, 401);
    });

    await test('should reject delete with wrong token', async () => {
      const response = await trpcMutate(
        'requests.delete',
        { id: 'some-id' },
        { Authorization: 'Bearer wrong-token' }
      );
      assert.strictEqual(response.status, 401);
    });
  });
});
