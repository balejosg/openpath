import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildPathRulePatterns,
  extractHostname,
  isExtensionUrl,
} from '../src/lib/path-blocking.js';

void test('path-blocking utilities normalize extension URLs and path patterns', () => {
  assert.equal(isExtensionUrl('moz-extension://abc/page.html'), true);
  assert.equal(isExtensionUrl('https://example.test'), false);
  assert.equal(extractHostname('https://example.test/path'), 'example.test');
  assert.deepEqual(buildPathRulePatterns('youtube'), ['*://*youtube*']);
});
