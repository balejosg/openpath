import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  normalizeDiagnosticContext,
  parseAutoRequestPayload,
  parseSubmitRequestPayload,
  parseWhitelistDomain,
} from '../../src/lib/public-request-input.js';

void describe('public-request-input', () => {
  void test('parseAutoRequestPayload supports snake_case fields', () => {
    const result = parseAutoRequestPayload({
      domain: 'Example.com',
      hostname: 'HOST',
      token: 't',
      origin_page: 'https://origin.example/path',
      target_url: 'https://api.example/private.json',
      reason: '  ok  ',
    });

    assert.strictEqual(result.domainRaw, 'Example.com');
    assert.strictEqual(result.hostnameRaw, 'HOST');
    assert.strictEqual(result.token, 't');
    assert.strictEqual(result.originPageRaw, 'https://origin.example/path');
    assert.strictEqual(result.targetUrlRaw, 'https://api.example/private.json');
    assert.strictEqual(result.reasonRaw, 'ok');
  });

  void test('parseAutoRequestPayload accepts bounded generic diagnostic context', () => {
    const result = parseAutoRequestPayload({
      domain: 'Example.com',
      hostname: 'HOST',
      token: 't',
      diagnostic_context: {
        correlation_id: 'corr-123',
        probe_id: 'font-subresource',
        request_type: 'font',
        target_hostname: 'fonts.gstatic.com',
        ignored: 'not public API',
      },
    });

    assert.deepStrictEqual(result.diagnosticContextRaw, {
      correlation_id: 'corr-123',
      probe_id: 'font-subresource',
      request_type: 'font',
      target_hostname: 'fonts.gstatic.com',
      ignored: 'not public API',
    });
    assert.strictEqual(
      normalizeDiagnosticContext(result.diagnosticContextRaw),
      'correlation_id=corr-123; probe_id=font-subresource; request_type=font; target_hostname=fonts.gstatic.com'
    );
  });

  void test('parseSubmitRequestPayload supports camelCase + snake_case', () => {
    const result = parseSubmitRequestPayload({
      domain: 'Example.com',
      hostname: 'HOST',
      token: 't',
      reason: '  ok  ',
      originHost: 'origin.example',
      origin_page: 'https://origin.example/page',
      client_version: '2.0.0',
      errorType: 'NS_ERROR_UNKNOWN_HOST',
    });

    assert.strictEqual(result.originHostRaw, 'origin.example');
    assert.strictEqual(result.originPageRaw, 'https://origin.example/page');
    assert.strictEqual(result.clientVersionRaw, '2.0.0');
    assert.strictEqual(result.errorTypeRaw, 'NS_ERROR_UNKNOWN_HOST');
  });

  void test('parseWhitelistDomain cleans and validates whitelist domains', () => {
    const parsed = parseWhitelistDomain(' https://Example.com/ ');
    if (!parsed.ok) {
      assert.fail(`Expected ok domain parse, got error: ${parsed.error}`);
    }
    assert.strictEqual(parsed.domain, 'example.com');
  });

  void test('parseWhitelistDomain rejects empty/invalid domains', () => {
    const emptyParsed = parseWhitelistDomain('   ');
    assert.strictEqual(emptyParsed.ok, false);

    const invalidParsed = parseWhitelistDomain('bad domain');
    if (invalidParsed.ok) {
      assert.fail('Expected invalid domain parse to fail');
    }
    assert.ok(invalidParsed.error.length > 0);
  });
});
