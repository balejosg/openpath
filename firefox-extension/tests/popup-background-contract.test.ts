import { describe, test } from 'node:test';
import assert from 'node:assert';
import { normalizeBlockedDomains } from '../src/lib/popup-state.js';

void describe('popup/background blocked-domain contracts', () => {
  void test('reads blocked domains from nested background payloads', () => {
    const result = normalizeBlockedDomains({
      domains: {
        'cdn.example.com': {
          errors: ['NS_ERROR_UNKNOWN_HOST', 'NS_ERROR_NET_TIMEOUT'],
          origin: 'portal.example.com',
          timestamp: 123,
        },
      },
    });

    const domain = result['cdn.example.com'] as {
      count: number;
      origin?: string;
      timestamp: number;
    };
    assert.strictEqual(domain.count, 2);
    assert.strictEqual(domain.origin, 'portal.example.com');
    assert.strictEqual(domain.timestamp, 123);
  });

  void test('omits origin when the background payload sends null', () => {
    const result = normalizeBlockedDomains({
      domains: {
        'api.example.com': {
          errors: ['NS_ERROR_CONNECTION_REFUSED'],
          origin: null,
          timestamp: 321,
        },
      },
    });

    const domain = result['api.example.com'] as {
      count: number;
      origin?: string;
      timestamp: number;
    };
    assert.strictEqual(domain.count, 1);
    assert.strictEqual(domain.timestamp, 321);
    assert.ok(domain.origin === undefined);
  });
});
