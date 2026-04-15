import { describe, test } from 'node:test';
import assert from 'node:assert';
import { isAutoAllowRequestType, resolveAutoAllowState } from '../src/lib/auto-allow-workflow.js';

void describe('background auto-allow flow', () => {
  void test('auto-allows only AJAX/fetch request types', () => {
    assert.strictEqual(isAutoAllowRequestType('xmlhttprequest'), true);
    assert.strictEqual(isAutoAllowRequestType('fetch'), true);
    assert.strictEqual(isAutoAllowRequestType('script'), false);
    assert.strictEqual(isAutoAllowRequestType('image'), false);
  });

  void test('resolves state transitions for api and local-update outcomes', () => {
    assert.strictEqual(
      resolveAutoAllowState({
        apiSuccess: true,
        duplicate: false,
        localUpdateSuccess: true,
      }),
      'autoApproved'
    );

    assert.strictEqual(
      resolveAutoAllowState({
        apiSuccess: true,
        duplicate: true,
        localUpdateSuccess: true,
      }),
      'duplicate'
    );

    assert.strictEqual(
      resolveAutoAllowState({
        apiSuccess: true,
        duplicate: false,
        localUpdateSuccess: false,
      }),
      'localUpdateError'
    );

    assert.strictEqual(
      resolveAutoAllowState({
        apiSuccess: false,
        duplicate: false,
        localUpdateSuccess: false,
      }),
      'apiError'
    );
  });
});
