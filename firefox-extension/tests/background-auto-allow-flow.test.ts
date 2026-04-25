import { describe, test } from 'node:test';
import assert from 'node:assert';
import { isAutoAllowRequestType, resolveAutoAllowState } from '../src/lib/auto-allow-workflow.js';

void describe('background auto-allow flow', () => {
  void test('auto-allows page subresource request types', () => {
    assert.strictEqual(isAutoAllowRequestType('xmlhttprequest'), true);
    assert.strictEqual(isAutoAllowRequestType('fetch'), true);
    assert.strictEqual(isAutoAllowRequestType('script'), true);
    assert.strictEqual(isAutoAllowRequestType('image'), true);
    assert.strictEqual(isAutoAllowRequestType('stylesheet'), true);
    assert.strictEqual(isAutoAllowRequestType('font'), true);
    assert.strictEqual(isAutoAllowRequestType('media'), true);
    assert.strictEqual(isAutoAllowRequestType('main_frame'), false);
    assert.strictEqual(isAutoAllowRequestType('sub_frame'), false);
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
