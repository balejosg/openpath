import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createBackgroundSubdomainRulesController } from '../src/lib/background-subdomain-rules.js';

void describe('background subdomain blocking flow', () => {
  void test('blocks requests whose hostname matches a blocked subdomain rule', async () => {
    const controller = createBackgroundSubdomainRulesController({
      extensionOrigin: 'moz-extension://unit-test/',
      getBlockedSubdomains: async () => ({
        success: true,
        subdomains: ['ads.example.org'],
        hash: 'v1',
      }),
    });

    await controller.init();
    const result = controller.evaluateRequest({
      type: 'xmlhttprequest',
      url: 'https://img.ads.example.org/pixel',
    } as never);

    assert.deepStrictEqual(result, {
      cancel: true,
      reason: 'BLOCKED_SUBDOMAIN_POLICY:ads.example.org',
    });
    assert.deepStrictEqual(controller.getDebugState(), {
      success: true,
      version: 'v1',
      count: 1,
      rawRules: ['ads.example.org'],
    });
  });
});
