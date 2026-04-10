import assert from 'node:assert';
import { describe, test } from 'node:test';

import { buildBlockedDomainSubmitBody } from '../src/lib/blocked-request.js';

void describe('buildBlockedDomainSubmitBody()', () => {
  void test('builds submit API payload with blocked page context', () => {
    const payload = buildBlockedDomainSubmitBody({
      domain: 'learning.example',
      reason: 'Lo necesito para una actividad de clase',
      token: 'machine-token',
      hostname: 'classroom-host-1',
      clientVersion: '2.0.0-test',
      origin: 'portal.example',
      error: 'NS_ERROR_UNKNOWN_HOST',
    });

    assert.deepStrictEqual(payload, {
      domain: 'learning.example',
      reason: 'Lo necesito para una actividad de clase',
      token: 'machine-token',
      hostname: 'classroom-host-1',
      client_version: '2.0.0-test',
      origin_host: 'portal.example',
      error_type: 'NS_ERROR_UNKNOWN_HOST',
    });
  });

  void test('omits empty optional context fields', () => {
    const payload = buildBlockedDomainSubmitBody({
      domain: 'learning.example',
      reason: 'Lo necesito para una actividad de clase',
      token: 'machine-token',
      hostname: 'classroom-host-1',
      clientVersion: '2.0.0-test',
      origin: ' ',
      error: '',
    });

    assert.deepStrictEqual(payload, {
      domain: 'learning.example',
      reason: 'Lo necesito para una actividad de clase',
      token: 'machine-token',
      hostname: 'classroom-host-1',
      client_version: '2.0.0-test',
    });
  });
});
