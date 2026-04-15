import { describe, test } from 'node:test';
import assert from 'node:assert';
import { normalizeDomainStatuses, shouldEnableRequestAction } from '../src/lib/popup-state.js';

function buildAutoRequestPayload(input: {
  domain: string;
  origin: string;
  reason: string;
  token: string;
  hostname: string;
}): Record<string, string> {
  return {
    domain: input.domain,
    origin_page: input.origin,
    reason: input.reason,
    token: input.token,
    hostname: input.hostname,
  };
}

void describe('popup auto-allow UX contract', () => {
  void test('normalizes domain statuses from the background payload', () => {
    const result = normalizeDomainStatuses({
      statuses: {
        'cdn.example.com': { state: 'pending' },
        'api.example.com': { state: 'autoApproved' },
      },
    });

    assert.strictEqual(result['cdn.example.com']?.state, 'pending');
    assert.strictEqual(result['api.example.com']?.state, 'autoApproved');
  });

  void test('enables request actions only when domains, native host and config are ready', () => {
    assert.strictEqual(
      shouldEnableRequestAction({
        hasDomains: true,
        nativeAvailable: true,
        requestConfigured: true,
      }),
      true
    );

    assert.strictEqual(
      shouldEnableRequestAction({
        hasDomains: true,
        nativeAvailable: false,
        requestConfigured: true,
      }),
      false
    );
  });

  void test('builds the popup auto-request payload with the expected bridge fields', () => {
    const payload = buildAutoRequestPayload({
      domain: 'cdn.example.com',
      origin: 'portal.example.com',
      reason: 'auto-allow ajax (xmlhttprequest)',
      token: 'token123',
      hostname: 'host-aula-1',
    });

    assert.deepStrictEqual(payload, {
      domain: 'cdn.example.com',
      origin_page: 'portal.example.com',
      reason: 'auto-allow ajax (xmlhttprequest)',
      token: 'token123',
      hostname: 'host-aula-1',
    });
  });
});
