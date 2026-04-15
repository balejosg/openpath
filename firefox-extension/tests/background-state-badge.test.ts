import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert';
import { createBlockedMonitorState } from '../src/lib/blocked-monitor-state.js';
import { extractHostname } from '../src/lib/path-blocking.js';
import { getBadgeForTab, mockBrowser, resetMockState } from './mocks/browser.js';

function createBlockedDomainsState(): ReturnType<typeof createBlockedMonitorState> {
  return createBlockedMonitorState(
    {
      setBadgeText: (options): Promise<void> => mockBrowser.browserAction.setBadgeText(options),
      setBadgeBackgroundColor: (options): Promise<void> =>
        mockBrowser.browserAction.setBadgeBackgroundColor(options),
    },
    {
      extractHostname,
      now: () => Date.now(),
    }
  );
}

void describe('background blocked domain state and badge behavior', () => {
  beforeEach(() => {
    resetMockState();
  });

  void test('tracks per-tab blocked domains and accumulates errors', () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(1, 'google.com', 'NS_ERROR_CONNECTION_REFUSED');
    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_NET_TIMEOUT');

    assert.strictEqual(state.blockedDomains[1]?.size, 2);
    assert.deepStrictEqual(state.getBlockedDomainsForTab(1)['example.com']?.errors.sort(), [
      'NS_ERROR_NET_TIMEOUT',
      'NS_ERROR_UNKNOWN_HOST',
    ]);
  });

  void test('extracts the first origin hostname and preserves it across duplicate blocks', () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'ads.example.com', 'NS_ERROR_UNKNOWN_HOST', 'https://first.com/page');
    state.addBlockedDomain(
      1,
      'ads.example.com',
      'NS_ERROR_NET_TIMEOUT',
      'https://second.com/other'
    );

    const domain = state.getBlockedDomainsForTab(1)['ads.example.com'];
    assert.strictEqual(domain?.origin, 'first.com');
  });

  void test('clears tab state, handles unknown tabs, and isolates different tabs', () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'tab1.com', 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(2, 'tab2.com', 'NS_ERROR_UNKNOWN_HOST');

    assert.ok('tab1.com' in state.getBlockedDomainsForTab(1));
    assert.ok(!('tab2.com' in state.getBlockedDomainsForTab(1)));
    assert.ok('tab2.com' in state.getBlockedDomainsForTab(2));
    assert.deepStrictEqual(state.getBlockedDomainsForTab(999), {});

    state.clearBlockedDomains(1);
    assert.strictEqual(state.blockedDomains[1]?.size, 0);
  });

  void test('stores timestamps, deduplicates errors, and accepts edge-case tab IDs and hostnames', () => {
    const state = createBlockedDomainsState();
    const before = Date.now();
    const longHostname = `${'a'.repeat(63)}.${'b'.repeat(63)}.com`;

    state.addBlockedDomain(-1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(1, longHostname, 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(1, 'xn--mnchen-3ya.de', 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');

    const after = Date.now();
    const exampleDomain = state.getBlockedDomainsForTab(1)['example.com'];

    assert.ok('example.com' in state.getBlockedDomainsForTab(-1));
    assert.ok(longHostname in state.getBlockedDomainsForTab(1));
    assert.ok('xn--mnchen-3ya.de' in state.getBlockedDomainsForTab(1));
    assert.strictEqual(exampleDomain.errors.length, 1);
    const timestamp = exampleDomain.timestamp;
    assert.ok(timestamp >= before);
    assert.ok(timestamp <= after);
  });

  void test('updates and clears the badge count in red', async () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'a.com', 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(1, 'b.com', 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(1, 'c.com', 'NS_ERROR_UNKNOWN_HOST');

    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepStrictEqual(getBadgeForTab(1), { text: '3', color: '#FF0000' });

    state.clearBlockedDomains(1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.strictEqual(getBadgeForTab(1)?.text, '');

    state.ensureTabStorage(2);
    state.updateBadge(2);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.strictEqual(getBadgeForTab(2)?.text, '');
  });
});
