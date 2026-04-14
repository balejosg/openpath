import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  buildSubmitBlockedDomainInput,
  createBackgroundMessageHandler,
} from '../src/lib/background-message-handler.js';
import { SUBMIT_BLOCKED_DOMAIN_REQUEST_ACTION } from '../src/lib/blocked-screen-contract.js';

function createHandlerFixture(
  overrides: Partial<Parameters<typeof createBackgroundMessageHandler>[0]> = {}
): ReturnType<typeof createBackgroundMessageHandler> {
  return createBackgroundMessageHandler({
    clearBlockedDomains: () => undefined,
    evaluateBlockedPathDebug: ({ type, url }) => ({ cancel: type === 'fetch', url }),
    forceBlockedPathRulesRefresh: () => Promise.resolve({ success: true }),
    getBlockedDomainsForTab: (tabId) => ({ [`tab-${tabId.toString()}`]: { errors: [] } }),
    getDomainStatusesForTab: (tabId) => ({ [`tab-${tabId.toString()}`]: { state: 'detected' } }),
    getErrorMessage: (error) => (error instanceof Error ? error.message : String(error)),
    getMachineToken: () => Promise.resolve({ success: true, token: 'machine-token' }),
    getNativeBlockedPathsDebug: () => Promise.resolve({ success: true, paths: ['example.com/*'] }),
    getPathRulesDebug: () => ({
      success: true,
      version: 'v1',
      count: 1,
      rawRules: ['example.com/*'],
      compiledPatterns: ['*://example.com/*'],
    }),
    getSystemHostname: () => Promise.resolve({ success: true, hostname: 'lab-pc-01' }),
    isNativeHostAvailable: () => Promise.resolve(true),
    retryLocalUpdate: () => Promise.resolve({ success: true }),
    submitBlockedDomainRequest: (input) =>
      Promise.resolve({
        success: true,
        status: 'pending',
        ...(input.domain !== undefined ? { domain: input.domain } : {}),
      }),
    triggerWhitelistUpdate: () => Promise.resolve({ success: true }),
    verifyDomains: (domains) =>
      Promise.resolve({
        success: true,
        results: domains.map((domain) => ({ domain, inWhitelist: true })),
      }),
    ...overrides,
  });
}

await describe('background message handler', async () => {
  await test('builds submit payload without display-only fields', () => {
    assert.deepEqual(
      buildSubmitBlockedDomainInput({
        action: SUBMIT_BLOCKED_DOMAIN_REQUEST_ACTION,
        domain: 'example.com',
        error: 'NS_ERROR_UNKNOWN_HOST',
        origin: 'portal.school',
        reason: 'needed for class',
        tabId: 5,
      }),
      {
        domain: 'example.com',
        error: 'NS_ERROR_UNKNOWN_HOST',
        origin: 'portal.school',
        reason: 'needed for class',
      }
    );
  });

  await test('returns path-rule debug payloads through the injected provider', async () => {
    const handler = createHandlerFixture();

    const response = await handler({ action: 'getBlockedPathRulesDebug', tabId: 1 }, {});

    assert.deepEqual(response, {
      success: true,
      version: 'v1',
      count: 1,
      rawRules: ['example.com/*'],
      compiledPatterns: ['*://example.com/*'],
    });
  });

  await test('maps blocked-path evaluation requests through the injected evaluator', async () => {
    const handler = createHandlerFixture();

    const response = await handler(
      {
        action: 'evaluateBlockedPathDebug',
        tabId: 1,
        type: 'fetch',
        url: 'https://example.com/private',
      },
      {}
    );

    assert.deepEqual(response, {
      success: true,
      outcome: {
        cancel: true,
        url: 'https://example.com/private',
      },
    });
  });

  await test('validates blocked-domain submissions before delegating', async () => {
    const handler = createHandlerFixture();

    const response = await handler(
      {
        action: SUBMIT_BLOCKED_DOMAIN_REQUEST_ACTION,
        tabId: 1,
      },
      {}
    );

    assert.deepEqual(response, {
      success: false,
      error: 'domain and reason are required',
    });
  });

  await test('delegates blocked-domain submission with the normalized request input', async () => {
    let capturedInput: unknown;
    const handler = createHandlerFixture({
      submitBlockedDomainRequest: (input) => {
        capturedInput = input;
        return Promise.resolve({ success: true, status: 'pending' });
      },
    });

    const response = await handler(
      {
        action: SUBMIT_BLOCKED_DOMAIN_REQUEST_ACTION,
        tabId: 1,
        domain: 'example.com',
        reason: 'needed for class',
        origin: 'portal.school',
      },
      {}
    );

    assert.deepEqual(capturedInput, {
      domain: 'example.com',
      reason: 'needed for class',
      origin: 'portal.school',
    });
    assert.deepEqual(response, { success: true, status: 'pending' });
  });

  await test('reports hostname validation errors for retryLocalUpdate', async () => {
    const handler = createHandlerFixture();

    const response = await handler({ action: 'retryLocalUpdate', tabId: 1 }, {});

    assert.deepEqual(response, {
      success: false,
      error: 'hostname is required',
    });
  });
});
