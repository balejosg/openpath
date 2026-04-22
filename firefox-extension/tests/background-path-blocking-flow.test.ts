import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  buildPathRulePatterns,
  compileBlockedPathRules,
  evaluatePathBlocking,
  findMatchingBlockedPathRule,
} from '../src/lib/path-blocking.js';

void describe('background path blocking flow', () => {
  void test('compiles rules for base domains and subdomains', () => {
    const patterns = buildPathRulePatterns('facebook.com/gaming');
    assert.deepStrictEqual(patterns, ['*://*.facebook.com/gaming*', '*://facebook.com/gaming*']);
  });

  void test('matches blocked paths for domain, subdomain and wildcard rules', () => {
    const rules = compileBlockedPathRules(['facebook.com/gaming', '*/tracking/*']);

    const baseMatch = findMatchingBlockedPathRule('https://facebook.com/gaming/live', rules);
    assert.ok(baseMatch !== null);
    assert.strictEqual(baseMatch.rawRule, 'facebook.com/gaming');

    const subdomainMatch = findMatchingBlockedPathRule(
      'https://m.facebook.com/gaming/watch',
      rules
    );
    assert.ok(subdomainMatch !== null);
    assert.strictEqual(subdomainMatch.rawRule, 'facebook.com/gaming');

    const wildcardMatch = findMatchingBlockedPathRule(
      'https://example.org/app/tracking/pixel',
      rules
    );
    assert.ok(wildcardMatch !== null);
    assert.strictEqual(wildcardMatch.rawRule, '*/tracking/*');
  });

  void test('matches blocked paths when request URLs include ports', () => {
    const rules = compileBlockedPathRules(['site.127.0.0.1.sslip.io/*private*']);
    const matched = findMatchingBlockedPathRule(
      'http://site.127.0.0.1.sslip.io:53371/xhr/private.json',
      rules
    );
    assert.ok(matched !== null);
    assert.strictEqual(matched.rawRule, 'site.127.0.0.1.sslip.io/*private*');
  });

  void test('blocks frame and ajax requests that match blocked paths', () => {
    const rules = compileBlockedPathRules(['example.com/private']);

    const mainFrameOutcome = evaluatePathBlocking(
      {
        type: 'main_frame',
        url: 'https://example.com/private/data',
        originUrl: 'https://portal.school/dashboard',
      },
      rules,
      { extensionOrigin: 'moz-extension://unit-test-id/' }
    );
    assert.ok(mainFrameOutcome !== null);
    assert.ok(mainFrameOutcome.redirectUrl);
    assert.strictEqual(mainFrameOutcome.cancel, undefined);
    assert.ok((mainFrameOutcome.reason ?? '').startsWith('BLOCKED_PATH_POLICY:'));

    const xhrOutcome = evaluatePathBlocking(
      {
        type: 'xmlhttprequest',
        url: 'https://example.com/private/api',
        originUrl: 'https://allowed.example/app',
      },
      rules,
      { extensionOrigin: 'moz-extension://unit-test-id/' }
    );
    assert.deepStrictEqual(xhrOutcome, {
      cancel: true,
      reason: 'BLOCKED_PATH_POLICY:example.com/private',
    });

    const fetchOutcome = evaluatePathBlocking(
      {
        type: 'fetch',
        url: 'https://example.com/private/api',
        originUrl: 'https://allowed.example/app',
      },
      rules,
      { extensionOrigin: 'moz-extension://unit-test-id/' }
    );
    assert.deepStrictEqual(fetchOutcome, {
      cancel: true,
      reason: 'BLOCKED_PATH_POLICY:example.com/private',
    });
  });

  void test('ignores non-target resource types and extension URLs', () => {
    const rules = compileBlockedPathRules(['example.com/private']);

    const imageOutcome = evaluatePathBlocking(
      {
        type: 'image',
        url: 'https://example.com/private/banner.png',
      },
      rules,
      { extensionOrigin: 'moz-extension://unit-test-id/' }
    );
    assert.strictEqual(imageOutcome, null);

    const extensionOutcome = evaluatePathBlocking(
      {
        type: 'main_frame',
        url: 'moz-extension://abc123/blocked/blocked.html',
      },
      rules,
      { extensionOrigin: 'moz-extension://unit-test-id/' }
    );
    assert.strictEqual(extensionOutcome, null);
  });
});
