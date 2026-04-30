import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  compileBlockedSubdomainRules,
  evaluateSubdomainBlocking,
  findMatchingBlockedSubdomainRule,
} from '../src/lib/subdomain-blocking.js';

void describe('Firefox subdomain blocking', () => {
  void test('matches exact blocked subdomains and nested subdomains', () => {
    const rules = compileBlockedSubdomainRules(['ads.example.org']);
    assert.strictEqual(
      findMatchingBlockedSubdomainRule('https://ads.example.org/script.js', rules)?.rawRule,
      'ads.example.org'
    );
    assert.strictEqual(
      findMatchingBlockedSubdomainRule('https://img.ads.example.org/banner.png', rules)?.rawRule,
      'ads.example.org'
    );
    assert.strictEqual(findMatchingBlockedSubdomainRule('https://example.org/', rules), null);
  });

  void test('blocks frame and ajax requests that match blocked subdomains', () => {
    const rules = compileBlockedSubdomainRules(['ads.example.org']);

    assert.deepStrictEqual(
      evaluateSubdomainBlocking(
        {
          type: 'xmlhttprequest',
          url: 'https://img.ads.example.org/pixel',
          originUrl: 'https://allowed.example/app',
        },
        rules,
        { extensionOrigin: 'moz-extension://unit-test/' }
      ),
      {
        cancel: true,
        reason: 'BLOCKED_SUBDOMAIN_POLICY:ads.example.org',
      }
    );

    const mainFrameOutcome = evaluateSubdomainBlocking(
      {
        type: 'main_frame',
        url: 'https://ads.example.org/',
      },
      rules,
      { extensionOrigin: 'moz-extension://unit-test/' }
    );
    assert.ok(mainFrameOutcome?.redirectUrl);
    assert.strictEqual(mainFrameOutcome.reason, 'BLOCKED_SUBDOMAIN_POLICY:ads.example.org');
  });
});
