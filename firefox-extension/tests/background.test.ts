/**
 * OpenPath - Background Script Unit Tests
 * Tests for the extension's background script functions
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mockBrowser, resetMockState, getBadgeForTab } from './mocks/browser.js';

// =============================================================================
// Pure Functions (copied from background.ts for isolated testing)
// =============================================================================

const BLOCKING_ERRORS = [
  'NS_ERROR_UNKNOWN_HOST',
  'NS_ERROR_CONNECTION_REFUSED',
  'NS_ERROR_NET_TIMEOUT',
  'NS_ERROR_PROXY_CONNECTION_REFUSED',
];

const IGNORED_ERRORS = ['NS_BINDING_ABORTED', 'NS_ERROR_ABORT'];
const AUTO_ALLOW_REQUEST_TYPES = new Set(['xmlhttprequest', 'fetch']);
const BLOCKED_SCREEN_ERRORS = new Set([
  'NS_ERROR_UNKNOWN_HOST',
  'NS_ERROR_PROXY_CONNECTION_REFUSED',
]);
const BLOCKED_SCREEN_PATH = 'blocked/blocked.html';

interface MockOnErrorOccurredDetails {
  type: string;
  error: string;
  url: string;
}

type LocalDomainStatusState =
  | 'detected'
  | 'pending'
  | 'autoApproved'
  | 'duplicate'
  | 'localUpdateError'
  | 'apiError';

/**
 * Map native host snake_case result to popup camelCase result
 */
function mapNativeCheckResult(result: {
  domain: string;
  in_whitelist: boolean;
  resolved_ip?: string;
}): { domain: string; inWhitelist: boolean; resolvedIp?: string } {
  const mapped: { domain: string; inWhitelist: boolean; resolvedIp?: string } = {
    domain: result.domain,
    inWhitelist: result.in_whitelist,
  };

  if (result.resolved_ip !== undefined) {
    mapped.resolvedIp = result.resolved_ip;
  }

  return mapped;
}

function isSupportedNativeCheckAction(action: string): boolean {
  return action === 'checkWithNative' || action === 'verifyDomains';
}

function isSupportedNativeAvailabilityAction(action: string): boolean {
  return action === 'isNativeAvailable' || action === 'checkNative';
}

function isAutoAllowRequestType(type?: string): boolean {
  if (!type) return false;
  return AUTO_ALLOW_REQUEST_TYPES.has(type);
}

function isExtensionUrl(url: string): boolean {
  return url.startsWith('moz-extension://') || url.startsWith('chrome-extension://');
}

function shouldDisplayBlockedScreen(details: MockOnErrorOccurredDetails): boolean {
  if (details.type !== 'main_frame') {
    return false;
  }

  if (!BLOCKED_SCREEN_ERRORS.has(details.error)) {
    return false;
  }

  if (isExtensionUrl(details.url)) {
    return false;
  }

  return true;
}

function buildBlockedScreenRedirectUrl(payload: {
  extensionOrigin: string;
  hostname: string;
  error: string;
  origin: string | null;
}): string {
  const redirectUrl = new URL(BLOCKED_SCREEN_PATH, payload.extensionOrigin);
  redirectUrl.searchParams.set('domain', payload.hostname);
  redirectUrl.searchParams.set('error', payload.error);
  if (payload.origin) {
    redirectUrl.searchParams.set('origin', payload.origin);
  }

  return redirectUrl.toString();
}

function resolveAutoStatus(payload: {
  apiSuccess: boolean;
  duplicate: boolean;
  localUpdateSuccess: boolean;
}): LocalDomainStatusState {
  if (!payload.apiSuccess) {
    return 'apiError';
  }

  if (!payload.localUpdateSuccess) {
    return 'localUpdateError';
  }

  if (payload.duplicate) {
    return 'duplicate';
  }

  return 'autoApproved';
}

/**
 * Extract hostname from URL
 */
function extractHostname(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

/**
 * Check if an error should be processed as a block
 */
function isBlockingError(error: string): boolean {
  return BLOCKING_ERRORS.includes(error);
}

/**
 * Check if an error should be ignored
 */
function isIgnoredError(error: string): boolean {
  return IGNORED_ERRORS.includes(error);
}

// =============================================================================
// Blocked Domains Management (with mock browser)
// =============================================================================

interface BlockedDomainData {
  errors: Set<string>;
  origin: string | null;
  timestamp: number;
}

type BlockedDomainsMap = Record<number, Map<string, BlockedDomainData>>;

// Create a fresh state for each test
function createBlockedDomainsState(): {
  blockedDomains: BlockedDomainsMap;
  ensureTabStorage: (tabId: number) => void;
  addBlockedDomain: (tabId: number, hostname: string, error: string, originUrl?: string) => void;
  clearBlockedDomains: (tabId: number) => void;
  getBlockedDomainsForTab: (
    tabId: number
  ) => Record<string, { errors: string[]; origin: string | null; timestamp: number }>;
  updateBadge: (tabId: number) => void;
} {
  const blockedDomains: BlockedDomainsMap = {};

  function ensureTabStorage(tabId: number): void {
    blockedDomains[tabId] ??= new Map();
  }

  function updateBadge(tabId: number): void {
    const count = blockedDomains[tabId] ? blockedDomains[tabId].size : 0;

    void mockBrowser.browserAction.setBadgeText({
      text: count > 0 ? count.toString() : '',
      tabId: tabId,
    });

    void mockBrowser.browserAction.setBadgeBackgroundColor({
      color: '#FF0000',
      tabId: tabId,
    });
  }

  function addBlockedDomain(
    tabId: number,
    hostname: string,
    error: string,
    originUrl?: string
  ): void {
    ensureTabStorage(tabId);

    const originHostname = originUrl ? extractHostname(originUrl) : null;

    if (!blockedDomains[tabId]?.has(hostname)) {
      blockedDomains[tabId]?.set(hostname, {
        errors: new Set(),
        origin: originHostname,
        timestamp: Date.now(),
      });
    }
    blockedDomains[tabId]?.get(hostname)?.errors.add(error);

    updateBadge(tabId);
  }

  function clearBlockedDomains(tabId: number): void {
    if (blockedDomains[tabId]) {
      blockedDomains[tabId].clear();
    }
    updateBadge(tabId);
  }

  function getBlockedDomainsForTab(
    tabId: number
  ): Record<string, { errors: string[]; origin: string | null; timestamp: number }> {
    const result: Record<string, { errors: string[]; origin: string | null; timestamp: number }> =
      {};

    if (blockedDomains[tabId]) {
      blockedDomains[tabId].forEach((data, hostname) => {
        result[hostname] = {
          errors: Array.from(data.errors),
          origin: data.origin,
          timestamp: data.timestamp,
        };
      });
    }

    return result;
  }

  return {
    blockedDomains,
    ensureTabStorage,
    addBlockedDomain,
    clearBlockedDomains,
    getBlockedDomainsForTab,
    updateBadge,
  };
}

// =============================================================================
// extractHostname() Tests
// =============================================================================

void describe('extractHostname()', () => {
  void test('should extract hostname from valid HTTP URL', () => {
    assert.strictEqual(extractHostname('http://example.com/page'), 'example.com');
  });

  void test('should extract hostname from valid HTTPS URL', () => {
    assert.strictEqual(extractHostname('https://www.google.com/search?q=test'), 'www.google.com');
  });

  void test('should extract hostname with port', () => {
    assert.strictEqual(extractHostname('http://localhost:8080/api'), 'localhost');
  });

  void test('should handle subdomain', () => {
    assert.strictEqual(extractHostname('https://sub.domain.example.com'), 'sub.domain.example.com');
  });

  void test('should return null for invalid URL', () => {
    assert.strictEqual(extractHostname('not-a-url'), null);
  });

  void test('should return null for empty string', () => {
    assert.strictEqual(extractHostname(''), null);
  });

  void test('should handle file:// URLs', () => {
    // file:// URLs have empty hostname
    assert.strictEqual(extractHostname('file:///home/user/file.txt'), '');
  });

  void test('should handle about: URLs', () => {
    // In Node.js, about:blank parses with empty hostname
    // In Firefox, this may differ - test documents actual behavior
    const result = extractHostname('about:blank');
    assert.ok(result === '' || result === null);
  });

  void test('should handle data: URLs', () => {
    // data: URLs throw on URL parse
    const result = extractHostname('data:text/html,<h1>Hello</h1>');
    assert.strictEqual(result, '');
  });

  void test('should handle IP addresses', () => {
    assert.strictEqual(extractHostname('http://192.168.1.1/admin'), '192.168.1.1');
  });

  void test('should handle IPv6 addresses', () => {
    assert.strictEqual(extractHostname('http://[::1]:8080/'), '[::1]');
  });

  void test('Privacy: should never leak path in hostname extraction', () => {
    const url = 'https://example.com/private/api/v1?token=12345';
    const hostname = extractHostname(url);
    assert.strictEqual(hostname, 'example.com');
    assert.ok(!hostname.includes('private'));
    assert.ok(!hostname.includes('token'));
  });

  void test('Privacy: should handle credentials safely', () => {
    const url = 'https://admin:secret@internal.dev/config';
    const hostname = extractHostname(url);
    assert.strictEqual(hostname, 'internal.dev');
    assert.ok(!hostname.includes('admin'));
    assert.ok(!hostname.includes('secret'));
  });
});

// =============================================================================
// isBlockingError() Tests
// =============================================================================

void describe('isBlockingError()', () => {
  void test('should recognize NS_ERROR_UNKNOWN_HOST as blocking', () => {
    assert.strictEqual(isBlockingError('NS_ERROR_UNKNOWN_HOST'), true);
  });

  void test('should recognize NS_ERROR_CONNECTION_REFUSED as blocking', () => {
    assert.strictEqual(isBlockingError('NS_ERROR_CONNECTION_REFUSED'), true);
  });

  void test('should recognize NS_ERROR_NET_TIMEOUT as blocking', () => {
    assert.strictEqual(isBlockingError('NS_ERROR_NET_TIMEOUT'), true);
  });

  void test('should recognize NS_ERROR_PROXY_CONNECTION_REFUSED as blocking', () => {
    assert.strictEqual(isBlockingError('NS_ERROR_PROXY_CONNECTION_REFUSED'), true);
  });

  void test('should not recognize NS_BINDING_ABORTED as blocking', () => {
    assert.strictEqual(isBlockingError('NS_BINDING_ABORTED'), false);
  });

  void test('should not recognize random errors as blocking', () => {
    assert.strictEqual(isBlockingError('SOME_OTHER_ERROR'), false);
  });

  void test('should not recognize empty string as blocking', () => {
    assert.strictEqual(isBlockingError(''), false);
  });
});

// =============================================================================
// isIgnoredError() Tests
// =============================================================================

void describe('isIgnoredError()', () => {
  void test('should recognize NS_BINDING_ABORTED as ignored', () => {
    assert.strictEqual(isIgnoredError('NS_BINDING_ABORTED'), true);
  });

  void test('should recognize NS_ERROR_ABORT as ignored', () => {
    assert.strictEqual(isIgnoredError('NS_ERROR_ABORT'), true);
  });

  void test('should not ignore blocking errors', () => {
    assert.strictEqual(isIgnoredError('NS_ERROR_UNKNOWN_HOST'), false);
  });

  void test('should not ignore unknown errors', () => {
    assert.strictEqual(isIgnoredError('UNKNOWN_ERROR'), false);
  });
});

// =============================================================================
// Blocked Screen Routing Tests
// =============================================================================

void describe('shouldDisplayBlockedScreen()', () => {
  void test('should display blocked screen for main_frame DNS blocks', () => {
    assert.strictEqual(
      shouldDisplayBlockedScreen({
        type: 'main_frame',
        error: 'NS_ERROR_UNKNOWN_HOST',
        url: 'https://example.com/login',
      }),
      true
    );
  });

  void test('should not display blocked screen for subresource requests', () => {
    assert.strictEqual(
      shouldDisplayBlockedScreen({
        type: 'xmlhttprequest',
        error: 'NS_ERROR_UNKNOWN_HOST',
        url: 'https://api.example.com/v1/data',
      }),
      false
    );
  });

  void test('should not display blocked screen for extension urls', () => {
    assert.strictEqual(
      shouldDisplayBlockedScreen({
        type: 'main_frame',
        error: 'NS_ERROR_UNKNOWN_HOST',
        url: 'moz-extension://abc123/popup/popup.html',
      }),
      false
    );
  });

  void test('should not display blocked screen for generic network failures', () => {
    assert.strictEqual(
      shouldDisplayBlockedScreen({
        type: 'main_frame',
        error: 'NS_ERROR_NET_TIMEOUT',
        url: 'https://example.com',
      }),
      false
    );
  });
});

void describe('buildBlockedScreenRedirectUrl()', () => {
  void test('should include only non-sensitive query params', () => {
    const redirectUrl = buildBlockedScreenRedirectUrl({
      extensionOrigin: 'moz-extension://unit-test-id/',
      hostname: 'example.com',
      error: 'NS_ERROR_UNKNOWN_HOST',
      origin: 'portal.local',
    });

    const parsed = new URL(redirectUrl);
    assert.strictEqual(parsed.pathname, '/blocked/blocked.html');
    assert.strictEqual(parsed.searchParams.get('domain'), 'example.com');
    assert.strictEqual(parsed.searchParams.get('error'), 'NS_ERROR_UNKNOWN_HOST');
    assert.strictEqual(parsed.searchParams.get('origin'), 'portal.local');
    assert.strictEqual(parsed.searchParams.has('blockedUrl'), false);
  });
});

// =============================================================================
// Blocked Domains State Management Tests
// =============================================================================

void describe('Blocked Domains State', () => {
  beforeEach(() => {
    resetMockState();
  });

  void test('addBlockedDomain should create storage for new tab', () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');

    const tabDomains = state.blockedDomains[1];
    assert.ok(tabDomains !== undefined);
    assert.strictEqual(tabDomains.size, 1);
  });

  void test('addBlockedDomain should add hostname to existing tab', () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(1, 'google.com', 'NS_ERROR_CONNECTION_REFUSED');

    assert.strictEqual(state.blockedDomains[1]?.size, 2);
  });

  void test('addBlockedDomain should accumulate errors for same hostname', () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_NET_TIMEOUT');

    const domains = state.getBlockedDomainsForTab(1);
    assert.deepStrictEqual(domains['example.com']?.errors.sort(), [
      'NS_ERROR_NET_TIMEOUT',
      'NS_ERROR_UNKNOWN_HOST',
    ]);
  });

  void test('addBlockedDomain should extract origin hostname', () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(
      1,
      'ads.example.com',
      'NS_ERROR_UNKNOWN_HOST',
      'https://main-page.com/article'
    );

    const domains = state.getBlockedDomainsForTab(1);
    assert.strictEqual(domains['ads.example.com']?.origin, 'main-page.com');
  });

  void test('addBlockedDomain should update badge', async () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');

    // Wait for async badge update
    await new Promise((resolve) => setTimeout(resolve, 10));

    const badge = getBadgeForTab(1);
    assert.ok(badge !== undefined);
    assert.strictEqual(badge.text, '1');
    assert.strictEqual(badge.color, '#FF0000');
  });

  void test('clearBlockedDomains should remove all domains for tab', () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(1, 'google.com', 'NS_ERROR_UNKNOWN_HOST');
    state.clearBlockedDomains(1);

    assert.strictEqual(state.blockedDomains[1]?.size, 0);
  });

  void test('clearBlockedDomains should reset badge', async () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');
    state.clearBlockedDomains(1);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const badge = getBadgeForTab(1);
    assert.strictEqual(badge?.text, '');
  });

  void test('getBlockedDomainsForTab should return empty for unknown tab', () => {
    const state = createBlockedDomainsState();

    const result = state.getBlockedDomainsForTab(999);
    assert.deepStrictEqual(result, {});
  });

  void test('getBlockedDomainsForTab should serialize errors as array', () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');

    const result = state.getBlockedDomainsForTab(1);
    assert.ok(Array.isArray(result['example.com']?.errors));
  });

  void test('getBlockedDomainsForTab should include timestamp', () => {
    const state = createBlockedDomainsState();
    const before = Date.now();

    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');

    const after = Date.now();
    const result = state.getBlockedDomainsForTab(1);
    const timestamp = result['example.com']?.timestamp ?? 0;

    assert.ok(timestamp >= before);
    assert.ok(timestamp <= after);
  });

  void test('different tabs should have isolated storage', () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'tab1.com', 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(2, 'tab2.com', 'NS_ERROR_UNKNOWN_HOST');

    const tab1Domains = state.getBlockedDomainsForTab(1);
    const tab2Domains = state.getBlockedDomainsForTab(2);

    assert.ok('tab1.com' in tab1Domains);
    assert.ok(!('tab2.com' in tab1Domains));
    assert.ok('tab2.com' in tab2Domains);
    assert.ok(!('tab1.com' in tab2Domains));
  });
});

// =============================================================================
// Badge Update Tests
// =============================================================================

void describe('Badge Updates', () => {
  beforeEach(() => {
    resetMockState();
  });

  void test('badge should show count when domains present', async () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'a.com', 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(1, 'b.com', 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(1, 'c.com', 'NS_ERROR_UNKNOWN_HOST');

    await new Promise((resolve) => setTimeout(resolve, 10));

    const badge = getBadgeForTab(1);
    assert.strictEqual(badge?.text, '3');
  });

  void test('badge should be empty when no domains', async () => {
    const state = createBlockedDomainsState();

    state.ensureTabStorage(1);
    state.updateBadge(1);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const badge = getBadgeForTab(1);
    assert.strictEqual(badge?.text, '');
  });

  void test('badge should be red', async () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');

    await new Promise((resolve) => setTimeout(resolve, 10));

    const badge = getBadgeForTab(1);
    assert.strictEqual(badge?.color, '#FF0000');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

void describe('Edge Cases', () => {
  beforeEach(() => {
    resetMockState();
  });

  void test('should handle negative tab IDs gracefully', () => {
    const state = createBlockedDomainsState();

    // Background requests have tabId = -1
    state.addBlockedDomain(-1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');

    const result = state.getBlockedDomainsForTab(-1);
    assert.ok('example.com' in result);
  });

  void test('should handle very long hostnames', () => {
    const longHostname = 'a'.repeat(63) + '.' + 'b'.repeat(63) + '.com';
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, longHostname, 'NS_ERROR_UNKNOWN_HOST');

    const result = state.getBlockedDomainsForTab(1);
    assert.ok(longHostname in result);
  });

  void test('should handle unicode hostnames (punycode)', () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'xn--mnchen-3ya.de', 'NS_ERROR_UNKNOWN_HOST');

    const result = state.getBlockedDomainsForTab(1);
    assert.ok('xn--mnchen-3ya.de' in result);
  });

  void test('should handle duplicate error additions', () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');
    state.addBlockedDomain(1, 'example.com', 'NS_ERROR_UNKNOWN_HOST');

    const result = state.getBlockedDomainsForTab(1);
    // Set should deduplicate
    assert.strictEqual(result['example.com']?.errors.length, 1);
  });

  void test('should preserve origin from first block of a domain', () => {
    const state = createBlockedDomainsState();

    state.addBlockedDomain(1, 'ads.com', 'NS_ERROR_UNKNOWN_HOST', 'https://first-origin.com');
    state.addBlockedDomain(1, 'ads.com', 'NS_ERROR_NET_TIMEOUT', 'https://second-origin.com');

    const result = state.getBlockedDomainsForTab(1);
    // Origin should be from first block
    assert.strictEqual(result['ads.com']?.origin, 'first-origin.com');
  });
});

// =============================================================================
// Message Contract Compatibility
// =============================================================================

void describe('Message Contract Compatibility', () => {
  void test('should support both verify action names', () => {
    assert.strictEqual(isSupportedNativeCheckAction('checkWithNative'), true);
    assert.strictEqual(isSupportedNativeCheckAction('verifyDomains'), true);
    assert.strictEqual(isSupportedNativeCheckAction('unknown'), false);
  });

  void test('should support both native availability action names', () => {
    assert.strictEqual(isSupportedNativeAvailabilityAction('isNativeAvailable'), true);
    assert.strictEqual(isSupportedNativeAvailabilityAction('checkNative'), true);
    assert.strictEqual(isSupportedNativeAvailabilityAction('unknown'), false);
  });

  void test('should map native snake_case fields to popup camelCase fields', () => {
    const mapped = mapNativeCheckResult({
      domain: 'cdn.example.com',
      in_whitelist: true,
      resolved_ip: '10.0.0.2',
    });

    assert.strictEqual(mapped.domain, 'cdn.example.com');
    assert.strictEqual(mapped.inWhitelist, true);
    assert.strictEqual(mapped.resolvedIp, '10.0.0.2');
  });
});

// =============================================================================
// Auto-Allow Flow
// =============================================================================

void describe('Auto-Allow Flow', () => {
  void test('should auto-allow only AJAX/fetch request types', () => {
    assert.strictEqual(isAutoAllowRequestType('xmlhttprequest'), true);
    assert.strictEqual(isAutoAllowRequestType('fetch'), true);
    assert.strictEqual(isAutoAllowRequestType('script'), false);
    assert.strictEqual(isAutoAllowRequestType('image'), false);
  });

  void test('should resolve autoApproved when api and local update succeed', () => {
    const status = resolveAutoStatus({
      apiSuccess: true,
      duplicate: false,
      localUpdateSuccess: true,
    });
    assert.strictEqual(status, 'autoApproved');
  });

  void test('should resolve duplicate when rule already exists', () => {
    const status = resolveAutoStatus({
      apiSuccess: true,
      duplicate: true,
      localUpdateSuccess: true,
    });
    assert.strictEqual(status, 'duplicate');
  });

  void test('should resolve localUpdateError when update script fails', () => {
    const status = resolveAutoStatus({
      apiSuccess: true,
      duplicate: false,
      localUpdateSuccess: false,
    });
    assert.strictEqual(status, 'localUpdateError');
  });

  void test('should resolve apiError when API request fails', () => {
    const status = resolveAutoStatus({
      apiSuccess: false,
      duplicate: false,
      localUpdateSuccess: false,
    });
    assert.strictEqual(status, 'apiError');
  });
});
