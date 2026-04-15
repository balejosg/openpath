import { describe, test } from 'node:test';
import assert from 'node:assert';
import { buildBlockedScreenRedirectUrl, extractHostname } from '../src/lib/path-blocking.js';

const BLOCKING_ERRORS = [
  'NS_ERROR_UNKNOWN_HOST',
  'NS_ERROR_CONNECTION_REFUSED',
  'NS_ERROR_NET_TIMEOUT',
  'NS_ERROR_PROXY_CONNECTION_REFUSED',
];

const IGNORED_ERRORS = ['NS_BINDING_ABORTED', 'NS_ERROR_ABORT'];
const BLOCKED_SCREEN_ERRORS = new Set([
  'NS_ERROR_UNKNOWN_HOST',
  'NS_ERROR_PROXY_CONNECTION_REFUSED',
]);

interface MockOnErrorOccurredDetails {
  type: string;
  error: string;
  url: string;
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

function isBlockingError(error: string): boolean {
  return BLOCKING_ERRORS.includes(error);
}

function isIgnoredError(error: string): boolean {
  return IGNORED_ERRORS.includes(error);
}

void describe('background core utilities', () => {
  void describe('extractHostname()', () => {
    void test('extracts hostnames from common URLs', () => {
      assert.strictEqual(extractHostname('http://example.com/page'), 'example.com');
      assert.strictEqual(extractHostname('https://www.google.com/search?q=test'), 'www.google.com');
      assert.strictEqual(extractHostname('http://localhost:8080/api'), 'localhost');
      assert.strictEqual(
        extractHostname('https://sub.domain.example.com'),
        'sub.domain.example.com'
      );
    });

    void test('handles non-http URLs and malformed input safely', () => {
      assert.strictEqual(extractHostname('not-a-url'), null);
      assert.strictEqual(extractHostname(''), null);
      assert.strictEqual(extractHostname('file:///home/user/file.txt'), '');
      const aboutResult = extractHostname('about:blank');
      assert.ok(aboutResult === '' || aboutResult === null);
      assert.strictEqual(extractHostname('data:text/html,<h1>Hello</h1>'), '');
    });

    void test('preserves privacy while parsing URLs', () => {
      const sensitiveUrl = 'https://example.com/private/api/v1?token=12345';
      const credentialUrl = new URL('/config', 'https://internal.dev');
      credentialUrl.username = 'admin';
      credentialUrl.password = 'redacted';

      const hostname = extractHostname(sensitiveUrl);
      assert.strictEqual(hostname, 'example.com');
      assert.ok(!hostname.includes('private'));
      assert.ok(!hostname.includes('token'));

      const credentialHost = extractHostname(credentialUrl.toString());
      assert.strictEqual(credentialHost, 'internal.dev');
      assert.ok(!credentialHost.includes('admin'));
      assert.ok(!credentialHost.includes('secret'));
    });

    void test('supports IP literals', () => {
      assert.strictEqual(extractHostname('http://192.168.1.1/admin'), '192.168.1.1');
      assert.strictEqual(extractHostname('http://[::1]:8080/'), '[::1]');
    });
  });

  void describe('blocking and ignored error classifiers', () => {
    void test('recognizes blocking errors only', () => {
      assert.strictEqual(isBlockingError('NS_ERROR_UNKNOWN_HOST'), true);
      assert.strictEqual(isBlockingError('NS_ERROR_CONNECTION_REFUSED'), true);
      assert.strictEqual(isBlockingError('NS_ERROR_NET_TIMEOUT'), true);
      assert.strictEqual(isBlockingError('NS_ERROR_PROXY_CONNECTION_REFUSED'), true);
      assert.strictEqual(isBlockingError('NS_BINDING_ABORTED'), false);
      assert.strictEqual(isBlockingError('SOME_OTHER_ERROR'), false);
      assert.strictEqual(isBlockingError(''), false);
    });

    void test('recognizes ignored errors only', () => {
      assert.strictEqual(isIgnoredError('NS_BINDING_ABORTED'), true);
      assert.strictEqual(isIgnoredError('NS_ERROR_ABORT'), true);
      assert.strictEqual(isIgnoredError('NS_ERROR_UNKNOWN_HOST'), false);
      assert.strictEqual(isIgnoredError('UNKNOWN_ERROR'), false);
    });
  });

  void describe('blocked screen routing', () => {
    void test('routes only main-frame DNS/proxy blocks to the blocked page', () => {
      assert.strictEqual(
        shouldDisplayBlockedScreen({
          type: 'main_frame',
          error: 'NS_ERROR_UNKNOWN_HOST',
          url: 'https://example.com/login',
        }),
        true
      );

      assert.strictEqual(
        shouldDisplayBlockedScreen({
          type: 'xmlhttprequest',
          error: 'NS_ERROR_UNKNOWN_HOST',
          url: 'https://api.example.com/v1/data',
        }),
        false
      );

      assert.strictEqual(
        shouldDisplayBlockedScreen({
          type: 'main_frame',
          error: 'NS_ERROR_UNKNOWN_HOST',
          url: 'moz-extension://abc123/popup/popup.html',
        }),
        false
      );

      assert.strictEqual(
        shouldDisplayBlockedScreen({
          type: 'main_frame',
          error: 'NS_ERROR_NET_TIMEOUT',
          url: 'https://example.com',
        }),
        false
      );
    });

    void test('builds blocked page redirects without leaking blocked URLs', () => {
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
});
