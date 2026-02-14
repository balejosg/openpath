/**
 * OpenPath - Popup Script Unit Tests
 * Tests for the extension's popup script functions
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

// =============================================================================
// Pure Functions (copied from popup.ts for isolated testing)
// =============================================================================

/**
 * Format error types for display
 */
function formatErrorTypes(errors: string[]): string {
  const errorLabels: Record<string, string> = {
    NS_ERROR_UNKNOWN_HOST: 'DNS bloqueado',
    NS_ERROR_CONNECTION_REFUSED: 'Conexión rechazada',
    NS_ERROR_NET_TIMEOUT: 'Timeout de red',
    NS_ERROR_PROXY_CONNECTION_REFUSED: 'Proxy bloqueado',
  };

  return errors.map((err) => errorLabels[err] ?? err).join(', ');
}

/**
 * Extract tab hostname from URL
 */
function extractTabHostname(url: string | undefined): string {
  if (!url) return 'Desconocido';
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return 'Página local';
  }
}

/**
 * Escape HTML (simplified version for testing without DOM)
 */
function escapeHtml(text: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => escapeMap[char] ?? char);
}

/**
 * Generate token from hostname using crypto (mock for testing)
 * Note: actual implementation uses crypto.subtle.digest
 */
function generateToken(hostname: string, secret: string): Promise<string> {
  // Simplified mock - in real code this uses SHA-256
  const data = hostname + secret;
  // Return base64-like string for testing purposes
  return Promise.resolve(Buffer.from(data).toString('base64'));
}

/**
 * Normalize background payload shape for popup rendering
 */
function normalizeBlockedDomainsResponse(
  response: unknown
): Record<string, { count: number; timestamp: number; origin?: string }> {
  const payload = response as {
    domains?: Record<string, { errors: string[]; origin: string | null; timestamp: number }>;
  };
  const domains = payload.domains ?? {};
  const normalized: Record<string, { count: number; timestamp: number; origin?: string }> = {};

  Object.entries(domains).forEach(([hostname, data]) => {
    const entry: { count: number; timestamp: number; origin?: string } = {
      count: data.errors.length,
      timestamp: data.timestamp,
    };

    if (data.origin !== null) {
      entry.origin = data.origin;
    }

    normalized[hostname] = entry;
  });

  return normalized;
}

function normalizeDomainStatusesResponse(response: unknown): Record<string, { state: string }> {
  const payload = response as { statuses?: Record<string, { state: string }> };
  return payload.statuses ?? {};
}

function shouldEnableRequestAction(input: {
  hasDomains: boolean;
  nativeAvailable: boolean;
  apiAvailable: boolean;
  requestConfigured: boolean;
}): boolean {
  return input.hasDomains && input.nativeAvailable && input.apiAvailable && input.requestConfigured;
}

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

// =============================================================================
// formatErrorTypes() Tests
// =============================================================================

void describe('formatErrorTypes()', () => {
  void test('should translate DNS block error', () => {
    const result = formatErrorTypes(['NS_ERROR_UNKNOWN_HOST']);
    assert.strictEqual(result, 'DNS bloqueado');
  });

  void test('should translate connection refused error', () => {
    const result = formatErrorTypes(['NS_ERROR_CONNECTION_REFUSED']);
    assert.strictEqual(result, 'Conexión rechazada');
  });

  void test('should translate timeout error', () => {
    const result = formatErrorTypes(['NS_ERROR_NET_TIMEOUT']);
    assert.strictEqual(result, 'Timeout de red');
  });

  void test('should translate proxy error', () => {
    const result = formatErrorTypes(['NS_ERROR_PROXY_CONNECTION_REFUSED']);
    assert.strictEqual(result, 'Proxy bloqueado');
  });

  void test('should join multiple errors with comma', () => {
    const result = formatErrorTypes(['NS_ERROR_UNKNOWN_HOST', 'NS_ERROR_NET_TIMEOUT']);
    assert.strictEqual(result, 'DNS bloqueado, Timeout de red');
  });

  void test('should keep unknown errors as-is', () => {
    const result = formatErrorTypes(['CUSTOM_ERROR']);
    assert.strictEqual(result, 'CUSTOM_ERROR');
  });

  void test('should handle mixed known and unknown errors', () => {
    const result = formatErrorTypes(['NS_ERROR_UNKNOWN_HOST', 'CUSTOM_ERROR']);
    assert.strictEqual(result, 'DNS bloqueado, CUSTOM_ERROR');
  });

  void test('should handle empty array', () => {
    const result = formatErrorTypes([]);
    assert.strictEqual(result, '');
  });

  void test('should handle single error', () => {
    const result = formatErrorTypes(['NS_ERROR_CONNECTION_REFUSED']);
    assert.strictEqual(result, 'Conexión rechazada');
  });
});

// =============================================================================
// extractTabHostname() Tests
// =============================================================================

void describe('extractTabHostname()', () => {
  void test('should extract hostname from HTTPS URL', () => {
    const result = extractTabHostname('https://www.example.com/page');
    assert.strictEqual(result, 'www.example.com');
  });

  void test('should extract hostname from HTTP URL', () => {
    const result = extractTabHostname('http://example.com');
    assert.strictEqual(result, 'example.com');
  });

  void test('should return "Desconocido" for undefined URL', () => {
    const result = extractTabHostname(undefined);
    assert.strictEqual(result, 'Desconocido');
  });

  void test('should return "Desconocido" for empty string', () => {
    const result = extractTabHostname('');
    assert.strictEqual(result, 'Desconocido');
  });

  void test('should return "Página local" for invalid URL', () => {
    const result = extractTabHostname('not-a-valid-url');
    assert.strictEqual(result, 'Página local');
  });

  void test('should return empty string or fallback for about: URLs', () => {
    const result = extractTabHostname('about:blank');
    // In Node.js, about:blank parses successfully with empty hostname
    // The function returns empty string in this case (not 'Página local')
    assert.ok(result === '' || result === 'Página local');
  });

  void test('should handle URL with port', () => {
    const result = extractTabHostname('http://localhost:3000/api');
    assert.strictEqual(result, 'localhost');
  });

  void test('should handle URL with query parameters', () => {
    const result = extractTabHostname('https://search.example.com?q=test&page=1');
    assert.strictEqual(result, 'search.example.com');
  });

  void test('should handle URL with fragment', () => {
    const result = extractTabHostname('https://docs.example.com#section-1');
    assert.strictEqual(result, 'docs.example.com');
  });

  void test('should handle IP address URL', () => {
    const result = extractTabHostname('http://192.168.1.1/admin');
    assert.strictEqual(result, '192.168.1.1');
  });

  void test('should handle file:// URL', () => {
    // file:// URLs have empty hostname, URL parse succeeds
    const result = extractTabHostname('file:///home/user/doc.html');
    assert.strictEqual(result, '');
  });
});

// =============================================================================
// escapeHtml() Tests
// =============================================================================

void describe('escapeHtml()', () => {
  void test('should escape < character', () => {
    const result = escapeHtml('<script>');
    assert.strictEqual(result, '&lt;script&gt;');
  });

  void test('should escape > character', () => {
    const result = escapeHtml('a > b');
    assert.strictEqual(result, 'a &gt; b');
  });

  void test('should escape & character', () => {
    const result = escapeHtml('a & b');
    assert.strictEqual(result, 'a &amp; b');
  });

  void test('should escape " character', () => {
    const result = escapeHtml('say "hello"');
    assert.strictEqual(result, 'say &quot;hello&quot;');
  });

  void test("should escape ' character", () => {
    const result = escapeHtml("it's");
    assert.strictEqual(result, 'it&#39;s');
  });

  void test('should escape multiple characters', () => {
    const result = escapeHtml('<a href="test">Link</a>');
    assert.strictEqual(result, '&lt;a href=&quot;test&quot;&gt;Link&lt;/a&gt;');
  });

  void test('should not escape safe characters', () => {
    const result = escapeHtml('Hello World 123');
    assert.strictEqual(result, 'Hello World 123');
  });

  void test('should handle empty string', () => {
    const result = escapeHtml('');
    assert.strictEqual(result, '');
  });

  void test('should handle unicode characters', () => {
    const result = escapeHtml('Hola mundo 日本語');
    assert.strictEqual(result, 'Hola mundo 日本語');
  });

  void test('should handle script injection attempt', () => {
    const result = escapeHtml('<script>alert("XSS")</script>');
    assert.strictEqual(result, '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
  });
});

// =============================================================================
// generateToken() Tests
// =============================================================================

void describe('generateToken()', () => {
  void test('should generate consistent token for same inputs', async () => {
    const token1 = await generateToken('host1', 'secret123');
    const token2 = await generateToken('host1', 'secret123');
    assert.strictEqual(token1, token2);
  });

  void test('should generate different tokens for different hostnames', async () => {
    const token1 = await generateToken('host1', 'secret');
    const token2 = await generateToken('host2', 'secret');
    assert.notStrictEqual(token1, token2);
  });

  void test('should generate different tokens for different secrets', async () => {
    const token1 = await generateToken('host', 'secret1');
    const token2 = await generateToken('host', 'secret2');
    assert.notStrictEqual(token1, token2);
  });

  void test('should return base64-encoded string', async () => {
    const token = await generateToken('test-host', 'test-secret');
    // Base64 characters only
    assert.ok(/^[A-Za-z0-9+/=]+$/.test(token));
  });

  void test('should handle empty hostname', async () => {
    const token = await generateToken('', 'secret');
    assert.ok(token.length > 0);
  });

  void test('should handle empty secret', async () => {
    const token = await generateToken('hostname', '');
    assert.ok(token.length > 0);
  });

  void test('should handle special characters in hostname', async () => {
    const token = await generateToken('host.with-special_chars', 'secret');
    assert.ok(token.length > 0);
  });
});

// =============================================================================
// Integration-style Tests
// =============================================================================

void describe('Error Display Integration', () => {
  void test('should format typical DNS block scenario', () => {
    // Simulates what popup would display for a blocked domain
    const errors = ['NS_ERROR_UNKNOWN_HOST'];
    const origin = 'https://main-site.com/article';

    const errorText = formatErrorTypes(errors);
    const originHost = extractTabHostname(origin);

    assert.strictEqual(errorText, 'DNS bloqueado');
    assert.strictEqual(originHost, 'main-site.com');
  });

  void test('should format multiple error types correctly', () => {
    const errors = ['NS_ERROR_UNKNOWN_HOST', 'NS_ERROR_CONNECTION_REFUSED', 'NS_ERROR_NET_TIMEOUT'];

    const result = formatErrorTypes(errors);

    assert.ok(result.includes('DNS bloqueado'));
    assert.ok(result.includes('Conexión rechazada'));
    assert.ok(result.includes('Timeout de red'));
  });

  void test('should safely escape malicious domain names', () => {
    const maliciousDomain = 'domain<script>alert(1)</script>.com';
    const escaped = escapeHtml(maliciousDomain);

    assert.ok(!escaped.includes('<script>'));
    assert.ok(escaped.includes('&lt;script&gt;'));
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

void describe('Edge Cases', () => {
  void test('formatErrorTypes should handle all four known errors', () => {
    const allErrors = [
      'NS_ERROR_UNKNOWN_HOST',
      'NS_ERROR_CONNECTION_REFUSED',
      'NS_ERROR_NET_TIMEOUT',
      'NS_ERROR_PROXY_CONNECTION_REFUSED',
    ];

    const result = formatErrorTypes(allErrors);
    const expectedParts = [
      'DNS bloqueado',
      'Conexión rechazada',
      'Timeout de red',
      'Proxy bloqueado',
    ];

    expectedParts.forEach((part) => {
      assert.ok(result.includes(part), `Should include "${part}"`);
    });
  });

  void test('extractTabHostname should handle moz-extension:// URLs', () => {
    const result = extractTabHostname('moz-extension://abc123/popup.html');
    assert.strictEqual(result, 'abc123');
  });

  void test('extractTabHostname should handle chrome-extension:// URLs', () => {
    const result = extractTabHostname('chrome-extension://abc123/popup.html');
    assert.strictEqual(result, 'abc123');
  });

  void test('escapeHtml should handle nested escape sequences', () => {
    const input = '&amp;lt;'; // Already escaped &lt;
    const result = escapeHtml(input);
    assert.strictEqual(result, '&amp;amp;lt;');
  });

  void test('escapeHtml should handle very long strings', () => {
    const longString = '<script>'.repeat(1000);
    const result = escapeHtml(longString);
    assert.ok(!result.includes('<script>'));
    assert.ok(result.length > longString.length); // Escaped version is longer
  });
});

// =============================================================================
// Privacy & Data Minimization Tests
// =============================================================================

void describe('Privacy & Data Minimization', () => {
  void test('extractTabHostname should never include URL path', () => {
    const url = 'https://example.com/secret/path/to/resource?query=sensitive';
    const result = extractTabHostname(url);
    assert.strictEqual(result, 'example.com');
    assert.ok(!result.includes('secret'));
    assert.ok(!result.includes('query'));
  });

  void test('extractTabHostname should handle URLs with credentials safely', () => {
    const url = 'https://user:password@example.com/path';
    const result = extractTabHostname(url);
    assert.strictEqual(result, 'example.com');
    assert.ok(!result.includes('user'));
    assert.ok(!result.includes('password'));
  });

  void test('extractTabHostname should handle ports without leaking path', () => {
    const url = 'http://localhost:8080/sensitive-api';
    const result = extractTabHostname(url);
    assert.strictEqual(result, 'localhost');
    assert.ok(!result.includes('8080')); // extractTabHostname specifically returns hostname, not host
    assert.ok(!result.includes('sensitive'));
  });
});

// =============================================================================
// Popup/Background Contract Tests
// =============================================================================

void describe('Popup/Background Contract', () => {
  void test('should read blocked domains from nested domains payload', () => {
    const response = {
      domains: {
        'cdn.example.com': {
          errors: ['NS_ERROR_UNKNOWN_HOST', 'NS_ERROR_NET_TIMEOUT'],
          origin: 'portal.example.com',
          timestamp: 123,
        },
      },
    };

    const result = normalizeBlockedDomainsResponse(response);
    const domain = result['cdn.example.com'] as {
      count: number;
      timestamp: number;
      origin?: string;
    };
    assert.strictEqual(domain.count, 2);
    assert.strictEqual(domain.origin, 'portal.example.com');
  });

  void test('should omit origin when background origin is null', () => {
    const response = {
      domains: {
        'api.example.com': {
          errors: ['NS_ERROR_CONNECTION_REFUSED'],
          origin: null,
          timestamp: 321,
        },
      },
    };

    const result = normalizeBlockedDomainsResponse(response);
    const domain = result['api.example.com'] as {
      count: number;
      timestamp: number;
      origin?: string;
    };
    assert.strictEqual(domain.count, 1);
    assert.ok(domain.origin === undefined);
  });
});

// =============================================================================
// Auto-Allow UX Contract
// =============================================================================

void describe('Auto-Allow UX Contract', () => {
  void test('should normalize domain statuses payload from background', () => {
    const result = normalizeDomainStatusesResponse({
      statuses: {
        'cdn.example.com': { state: 'pending' },
        'api.example.com': { state: 'autoApproved' },
      },
    });

    assert.strictEqual(result['cdn.example.com']?.state, 'pending');
    assert.strictEqual(result['api.example.com']?.state, 'autoApproved');
  });

  void test('should enable request only when all requirements are met', () => {
    const enabled = shouldEnableRequestAction({
      hasDomains: true,
      nativeAvailable: true,
      apiAvailable: true,
      requestConfigured: true,
    });

    const disabledNoNative = shouldEnableRequestAction({
      hasDomains: true,
      nativeAvailable: false,
      apiAvailable: true,
      requestConfigured: true,
    });

    assert.strictEqual(enabled, true);
    assert.strictEqual(disabledNoNative, false);
  });

  void test('should include reason in auto request payload', () => {
    const payload = buildAutoRequestPayload({
      domain: 'cdn.example.com',
      origin: 'portal.example.com',
      reason: 'auto-allow ajax (xmlhttprequest)',
      token: 'token123',
      hostname: 'host-aula-1',
    });

    assert.strictEqual(payload.domain, 'cdn.example.com');
    assert.strictEqual(payload.origin_page, 'portal.example.com');
    assert.strictEqual(payload.reason, 'auto-allow ajax (xmlhttprequest)');
    assert.strictEqual(payload.token, 'token123');
    assert.strictEqual(payload.hostname, 'host-aula-1');
  });
});
