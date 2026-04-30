import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createBackgroundSubdomainRulesController } from '../src/lib/background-subdomain-rules.js';

void describe('background subdomain rules controller', () => {
  void test('refreshes blocked subdomain rules and exposes debug state', async () => {
    const controller = createBackgroundSubdomainRulesController({
      extensionOrigin: 'moz-extension://unit-test/',
      getBlockedSubdomains: () =>
        Promise.resolve({
          success: true,
          subdomains: ['media.example.test'],
          hash: 'policy-v1',
        }),
    });

    assert.strictEqual(await controller.refresh(true), true);
    assert.deepStrictEqual(controller.getDebugState(), {
      success: true,
      version: 'policy-v1',
      count: 1,
      rawRules: ['media.example.test'],
    });

    assert.strictEqual(
      controller.evaluateRequest({
        type: 'xmlhttprequest',
        url: 'https://cdn.media.example.test/image.png',
      } as never)?.reason,
      'BLOCKED_SUBDOMAIN_POLICY:media.example.test'
    );
    assert.strictEqual(await controller.refresh(false), true);
  });

  void test('reports native refresh failures without changing loaded rules', async () => {
    const controller = createBackgroundSubdomainRulesController({
      extensionOrigin: 'moz-extension://unit-test/',
      getBlockedSubdomains: () =>
        Promise.resolve({
          success: false,
          error: 'native unavailable',
        }),
    });

    assert.strictEqual(await controller.refresh(true), false);
    assert.deepStrictEqual(await controller.forceRefresh(), {
      success: false,
      error: 'No se pudieron refrescar las reglas de subdominio',
    });
    assert.deepStrictEqual(controller.getDebugState(), {
      success: true,
      version: '',
      count: 0,
      rawRules: [],
    });
  });

  void test('handles thrown native refresh errors', async () => {
    const controller = createBackgroundSubdomainRulesController({
      extensionOrigin: 'moz-extension://unit-test/',
      getBlockedSubdomains: () => Promise.reject(new Error('native crashed')),
    });

    assert.strictEqual(await controller.refresh(true), false);
  });

  void test('replaces an existing refresh loop timer', () => {
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    const intervals: (() => void)[] = [];
    const cleared: unknown[] = [];

    globalThis.setInterval = ((handler: TimerHandler) => {
      intervals.push(handler as () => void);
      return intervals.length as never;
    }) as unknown as typeof setInterval;
    globalThis.clearInterval = ((timer: unknown) => {
      cleared.push(timer);
    }) as unknown as typeof clearInterval;

    try {
      const controller = createBackgroundSubdomainRulesController({
        extensionOrigin: 'moz-extension://unit-test/',
        getBlockedSubdomains: () =>
          Promise.resolve({
            success: true,
            subdomains: [],
            hash: 'policy-v1',
          }),
      });

      controller.startRefreshLoop();
      controller.startRefreshLoop();

      assert.strictEqual(intervals.length, 2);
      assert.deepStrictEqual(cleared, [1]);
    } finally {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    }
  });
});
