import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isNativePolicyBlockedResult } from '../src/lib/background-runtime.js';

void test('native policy confirmation ignores fail-open or inactive policy results', () => {
  assert.equal(
    isNativePolicyBlockedResult({
      domain: 'portal.fixture.test',
      inWhitelist: false,
      policyActive: false,
      resolves: false,
    }),
    false
  );
});

void test('native policy confirmation treats missing policy state as unknown, not inactive', () => {
  assert.equal(
    isNativePolicyBlockedResult({
      domain: 'legacy-native-host.example',
      inWhitelist: false,
      resolves: false,
    }),
    true
  );
});

void test('native policy confirmation ignores errored native check results', () => {
  assert.equal(
    isNativePolicyBlockedResult({
      domain: 'broken-native-host.example',
      error: 'OpenPath whitelist command not found',
      inWhitelist: false,
      policyActive: true,
      resolves: false,
    }),
    false
  );
});

void test('native policy confirmation requires a denied domain that does not resolve publicly', () => {
  assert.equal(
    isNativePolicyBlockedResult({
      domain: 'blocked.example',
      inWhitelist: false,
      policyActive: true,
      resolves: false,
    }),
    true
  );
  assert.equal(
    isNativePolicyBlockedResult({
      domain: 'allowed.example',
      inWhitelist: false,
      policyActive: true,
      resolves: true,
    }),
    false
  );
});
