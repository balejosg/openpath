import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Runtime, WebRequest } from 'webextension-polyfill';

import { createPageResourceAutoAllowGate } from '../src/lib/page-resource-auto-allow-gate.js';

void describe('page resource auto-allow gate', () => {
  void test('eligible subresources wait for auto-allow before request release', async () => {
    let release: (() => void) | undefined;
    const calls: unknown[] = [];
    const gate = createPageResourceAutoAllowGate({
      autoAllowBlockedDomain: (tabId, hostname, origin, requestType, targetUrl) => {
        calls.push({ tabId, hostname, origin, requestType, targetUrl });
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
      getTabUrl: () => Promise.resolve('https://lesson.example/app'),
    });

    const response = gate.waitForAutoAllowBeforeRequest({
      originUrl: 'https://lesson.example/app',
      tabId: 2,
      type: 'script',
      url: 'https://cdn.lesson.example/app.js',
    } as WebRequest.OnBeforeRequestDetailsType);
    let completed = false;
    void response.then(() => {
      completed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(completed, false);
    assert.deepEqual(calls, [
      {
        tabId: 2,
        hostname: 'cdn.lesson.example',
        origin: 'https://lesson.example/app',
        requestType: 'script',
        targetUrl: 'https://cdn.lesson.example/app.js',
      },
    ]);

    release?.();
    assert.deepEqual(await response, {});
    assert.equal(completed, true);
  });

  void test('timeout resolves to an empty blocking response', async () => {
    const gate = createPageResourceAutoAllowGate({
      autoAllowBeforeRequestTimeoutMs: 1,
      autoAllowBlockedDomain: () => new Promise<void>(() => undefined),
      getTabUrl: () => Promise.resolve('https://lesson.example/app'),
    });

    const response = await gate.waitForAutoAllowBeforeRequest({
      originUrl: 'https://lesson.example/app',
      tabId: 2,
      type: 'image',
      url: 'https://img.lesson.example/pixel.png',
    } as WebRequest.OnBeforeRequestDetailsType);

    assert.deepEqual(response, {});
  });

  void test('malformed runtime messages return failure responses', async () => {
    const gate = createPageResourceAutoAllowGate({
      autoAllowBlockedDomain: () => Promise.resolve(),
      getTabUrl: () => Promise.resolve(undefined),
    });

    const response = await gate.handlePageResourceCandidateMessage(
      {
        action: 'openpathPageResourceCandidate',
        pageUrl: 'https://lesson.example/app',
      },
      { tab: { id: 9, url: 'https://lesson.example/app' } } as Runtime.MessageSender
    );

    assert.deepEqual(response, { success: false, error: 'resourceUrl is required' });
  });

  void test('runtime candidate messages acknowledge before background auto-allow completes', async () => {
    let release: (() => void) | undefined;
    const calls: unknown[] = [];
    const gate = createPageResourceAutoAllowGate({
      autoAllowBlockedDomain: (tabId, hostname, origin, requestType, targetUrl) => {
        calls.push({ tabId, hostname, origin, requestType, targetUrl });
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
      getTabUrl: () => Promise.resolve(undefined),
    });

    const response = await gate.handlePageResourceCandidateMessage(
      {
        action: 'openpathPageResourceCandidate',
        kind: 'script',
        pageUrl: 'https://lesson.example/app',
        resourceUrl: 'https://cdn.lesson.example/app.js',
      },
      { tab: { id: 9, url: 'https://lesson.example/app' } } as Runtime.MessageSender
    );

    assert.deepEqual(response, { success: true });
    assert.deepEqual(calls, [
      {
        tabId: 9,
        hostname: 'cdn.lesson.example',
        origin: 'https://lesson.example/app',
        requestType: 'script',
        targetUrl: 'https://cdn.lesson.example/app.js',
      },
    ]);

    release?.();
  });

  void test('missing request type with page context becomes a generic page resource', async () => {
    const calls: unknown[] = [];
    const gate = createPageResourceAutoAllowGate({
      autoAllowBlockedDomain: (tabId, hostname, origin, requestType, targetUrl) => {
        calls.push({ tabId, hostname, origin, requestType, targetUrl });
        return Promise.resolve();
      },
      getTabUrl: () => Promise.resolve(undefined),
    });

    await gate.triggerAutoAllowForEligibleRequest({
      originUrl: 'https://lesson.example/app',
      tabId: 7,
      url: 'https://api.lesson.example/data.json',
    } as WebRequest.OnBeforeRequestDetailsType);

    assert.deepEqual(calls, [
      {
        tabId: 7,
        hostname: 'api.lesson.example',
        origin: 'https://lesson.example/app',
        requestType: 'other',
        targetUrl: 'https://api.lesson.example/data.json',
      },
    ]);
  });
});
