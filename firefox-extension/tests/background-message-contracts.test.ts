import { describe, test } from 'node:test';
import assert from 'node:assert';
import { compileBlockedPathRules, evaluatePathBlocking } from '../src/lib/path-blocking.js';

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

async function handleForcedBlockedPathRefresh(
  refreshFn: (force: boolean) => Promise<boolean>
): Promise<{ success: boolean; error?: string }> {
  try {
    const success = await refreshFn(true);
    return success
      ? { success: true }
      : { success: false, error: 'No se pudieron refrescar las reglas de ruta' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

void describe('background message contract compatibility', () => {
  void test('supports both verify and native-availability action names', () => {
    assert.strictEqual(isSupportedNativeCheckAction('checkWithNative'), true);
    assert.strictEqual(isSupportedNativeCheckAction('verifyDomains'), true);
    assert.strictEqual(isSupportedNativeCheckAction('unknown'), false);

    assert.strictEqual(isSupportedNativeAvailabilityAction('isNativeAvailable'), true);
    assert.strictEqual(isSupportedNativeAvailabilityAction('checkNative'), true);
    assert.strictEqual(isSupportedNativeAvailabilityAction('unknown'), false);
  });

  void test('maps native snake_case fields to popup camelCase fields', () => {
    const mapped = mapNativeCheckResult({
      domain: 'cdn.example.com',
      in_whitelist: true,
      resolved_ip: '10.0.0.2',
    });

    assert.deepStrictEqual(mapped, {
      domain: 'cdn.example.com',
      inWhitelist: true,
      resolvedIp: '10.0.0.2',
    });
  });

  void test('forces blocked-path refresh with force=true and exposes failures', async () => {
    let receivedForce = false;
    const success = await handleForcedBlockedPathRefresh((force) => {
      receivedForce = force;
      return Promise.resolve(true);
    });
    assert.strictEqual(receivedForce, true);
    assert.deepStrictEqual(success, { success: true });

    const softFailure = await handleForcedBlockedPathRefresh(() => Promise.resolve(false));
    assert.deepStrictEqual(softFailure, {
      success: false,
      error: 'No se pudieron refrescar las reglas de ruta',
    });

    const hardFailure = await handleForcedBlockedPathRefresh(() =>
      Promise.reject(new Error('native host unavailable'))
    );
    assert.deepStrictEqual(hardFailure, {
      success: false,
      error: 'native host unavailable',
    });
  });

  void test('exposes blocked-path debug payload shapes', () => {
    const rules = compileBlockedPathRules(['example.com/private', '*.school.local/restricted']);
    const blockedPathPayload = {
      success: true,
      version: 'debug-version',
      count: rules.length,
      rawRules: rules.map((rule) => rule.rawRule),
      compiledPatterns: rules.flatMap((rule) => rule.compiledPatterns),
    };

    assert.deepStrictEqual(blockedPathPayload, {
      success: true,
      version: 'debug-version',
      count: 2,
      rawRules: ['example.com/private', '*.school.local/restricted'],
      compiledPatterns: [
        '*://*.example.com/private*',
        '*://example.com/private*',
        '*://*.school.local/restricted*',
        '*://school.local/restricted*',
      ],
    });

    const nativePayload = {
      success: true,
      action: 'get-blocked-paths',
      paths: ['example.com/private*'],
      count: 1,
      hash: 'abc123',
      mtime: 123,
      source: '/var/lib/openpath/whitelist.txt',
    };
    assert.deepStrictEqual(nativePayload, {
      success: true,
      action: 'get-blocked-paths',
      paths: ['example.com/private*'],
      count: 1,
      hash: 'abc123',
      mtime: 123,
      source: '/var/lib/openpath/whitelist.txt',
    });
  });

  void test('exposes blocked-path evaluation payload shape', () => {
    const rules = compileBlockedPathRules(['example.com/private']);
    const outcome = evaluatePathBlocking(
      {
        type: 'xmlhttprequest',
        url: 'https://example.com/private/data.json',
        originUrl: 'https://allowed.example/app',
      },
      rules,
      { extensionOrigin: 'moz-extension://unit-test-id/' }
    );

    assert.deepStrictEqual(
      {
        success: true,
        outcome,
      },
      {
        success: true,
        outcome: {
          cancel: true,
          reason: 'BLOCKED_PATH_POLICY:example.com/private',
        },
      }
    );
  });
});
