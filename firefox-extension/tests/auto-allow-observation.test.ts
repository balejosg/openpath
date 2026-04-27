import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  buildPageResourceCandidateMessage,
  pageResourceKindToRequestType,
  parsePageResourceCandidateMessage,
} from '../src/lib/auto-allow-observation.js';

void describe('auto allow observation', () => {
  void test('builds and parses page resource candidates for auto-allow', () => {
    const message = buildPageResourceCandidateMessage(
      'https://lesson.example/app',
      'https://cdn.example/asset.js',
      'script'
    );

    const parsed = parsePageResourceCandidateMessage(message, {
      senderTabId: 9,
      senderTabUrl: 'https://lesson.example/fallback',
    });

    assert.deepEqual(parsed, {
      ok: true,
      candidate: {
        hostname: 'cdn.example',
        originPage: 'https://lesson.example/app',
        requestType: 'script',
        tabId: 9,
        targetUrl: 'https://cdn.example/asset.js',
      },
    });
  });

  void test('maps unknown page resource kinds to other and rejects malformed candidates', () => {
    assert.equal(pageResourceKindToRequestType('fetch'), 'xmlhttprequest');
    assert.equal(pageResourceKindToRequestType('unknown-kind'), 'other');

    assert.deepEqual(
      parsePageResourceCandidateMessage(
        {
          action: 'openpathPageResourceCandidate',
          kind: 'fetch',
          pageUrl: 'https://lesson.example/app',
        },
        { senderTabId: undefined, senderTabUrl: undefined }
      ),
      { ok: false, error: 'resourceUrl is required' }
    );
  });
});
