import { describe, test } from 'node:test';
import assert from 'node:assert';
import { isAutoAllowRequestType, resolveAutoAllowState } from '../src/lib/auto-allow-workflow.js';

const AUTO_ALLOW_PAGE_RESOURCE_TYPES = [
  'xmlhttprequest',
  'fetch',
  'script',
  'stylesheet',
  'image',
  'object',
  'xslt',
  'ping',
  'beacon',
  'xml_dtd',
  'font',
  'media',
  'websocket',
  'csp_report',
  'imageset',
  'web_manifest',
  'speculative',
  'json',
  'other',
];

void describe('background auto-allow flow', () => {
  void test('auto-allows page subresource request types', () => {
    for (const requestType of AUTO_ALLOW_PAGE_RESOURCE_TYPES) {
      assert.strictEqual(isAutoAllowRequestType(requestType), true, requestType);
    }

    assert.strictEqual(isAutoAllowRequestType('main_frame'), false);
    assert.strictEqual(isAutoAllowRequestType('sub_frame'), false);
    assert.strictEqual(isAutoAllowRequestType(undefined), false);
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
