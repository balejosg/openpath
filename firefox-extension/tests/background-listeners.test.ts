import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Browser, WebRequest } from 'webextension-polyfill';

import { registerBackgroundListeners } from '../src/lib/background-listeners.js';

interface BlockedScreenContext {
  tabId: number;
  hostname: string;
  error: string;
  origin: string | null;
}

interface ConfirmBlockedScreenContext extends BlockedScreenContext {
  url: string;
}

type WebRequestErrorListener = (details: WebRequest.OnErrorOccurredDetailsType) => void;
type WebRequestBeforeListener = (details: WebRequest.OnBeforeRequestDetailsType) => unknown;
type WebNavigationBeforeListener = (details: {
  frameId: number;
  tabId: number;
  url: string;
}) => void;
type WebNavigationErrorListener = (details: {
  error: string;
  frameId: number;
  tabId: number;
  url: string;
}) => void;

interface AutoAllowCall {
  tabId: number;
  hostname: string;
  origin: string | null;
  requestType: WebRequest.ResourceType;
  targetUrl: string;
}

function waitForAsyncListeners(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function createListenerHarness(
  options: {
    confirmBlockedScreenNavigation?: (context: ConfirmBlockedScreenContext) => Promise<boolean>;
    currentTabUrl?: string | null;
    handleRuntimeMessage?: (message: unknown, sender: unknown) => unknown;
  } = {}
): {
  addedBlocks: BlockedScreenContext[];
  autoAllowCalls: AutoAllowCall[];
  beforeRequestFilters: unknown[];
  confirmCalls: ConfirmBlockedScreenContext[];
  redirects: BlockedScreenContext[];
  runtimeMessage:
    | ((message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => unknown)
    | null;
  webRequestBefore: WebRequestBeforeListener | null;
  webNavigationBefore: WebNavigationBeforeListener | null;
  webNavigationError: WebNavigationErrorListener | null;
  webRequestError: WebRequestErrorListener | null;
} {
  const addedBlocks: BlockedScreenContext[] = [];
  const autoAllowCalls: AutoAllowCall[] = [];
  const beforeRequestFilters: unknown[] = [];
  const confirmCalls: ConfirmBlockedScreenContext[] = [];
  const redirects: BlockedScreenContext[] = [];
  let webRequestBefore: WebRequestBeforeListener | null = null;
  let webRequestError: WebRequestErrorListener | null = null;
  let webNavigationBefore: WebNavigationBeforeListener | null = null;
  let webNavigationError: WebNavigationErrorListener | null = null;
  let runtimeMessage:
    | ((message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => unknown)
    | null = null;

  const browser = {
    webRequest: {
      onBeforeRequest: {
        addListener: (listener: WebRequestBeforeListener, filter: unknown) => {
          webRequestBefore = listener;
          beforeRequestFilters.push(filter);
        },
      },
      onErrorOccurred: {
        addListener: (listener: WebRequestErrorListener) => {
          webRequestError = listener;
        },
      },
    },
    webNavigation: {
      onBeforeNavigate: {
        addListener: (listener: WebNavigationBeforeListener) => {
          webNavigationBefore = listener;
        },
      },
      onErrorOccurred: {
        addListener: (listener: WebNavigationErrorListener) => {
          webNavigationError = listener;
        },
      },
    },
    runtime: {
      getURL: (path: string) => `moz-extension://unit-test/${path}`,
      onMessage: {
        addListener: (listener: unknown): void => {
          runtimeMessage = listener as (
            message: unknown,
            sender: unknown,
            sendResponse: (response: unknown) => void
          ) => unknown;
        },
      },
    },
    tabs: {
      get: () =>
        Promise.resolve({
          id: 1,
          url: options.currentTabUrl ?? undefined,
        }),
      onRemoved: {
        addListener: () => undefined,
      },
    },
  } as unknown as Browser;

  const listenerOptions = {
    addBlockedDomain: (tabId: number, hostname: string, error: string, origin?: string | null) => {
      addedBlocks.push({
        tabId,
        hostname,
        error,
        origin: origin ?? null,
      });
    },
    autoAllowBlockedDomain: (
      tabId: number,
      hostname: string,
      origin: string | null,
      requestType: WebRequest.ResourceType,
      targetUrl: string
    ) => {
      autoAllowCalls.push({ tabId, hostname, origin, requestType, targetUrl });
      return Promise.resolve();
    },
    browser,
    clearTabRuntimeState: () => undefined,
    disposeTab: () => undefined,
    evaluateBlockedPath: () => null,
    handleRuntimeMessage:
      options.handleRuntimeMessage ?? ((): Promise<undefined> => Promise.resolve(undefined)),
    redirectToBlockedScreen: (context: BlockedScreenContext) => {
      redirects.push(context);
      return Promise.resolve();
    },
    confirmBlockedScreenNavigation: async (context: ConfirmBlockedScreenContext) => {
      confirmCalls.push(context);
      return options.confirmBlockedScreenNavigation
        ? await options.confirmBlockedScreenNavigation(context)
        : false;
    },
  } as Parameters<typeof registerBackgroundListeners>[0] & {
    confirmBlockedScreenNavigation: (context: ConfirmBlockedScreenContext) => Promise<boolean>;
  };

  registerBackgroundListeners(listenerOptions);

  return {
    addedBlocks,
    autoAllowCalls,
    beforeRequestFilters,
    confirmCalls,
    redirects,
    get webRequestBefore(): WebRequestBeforeListener | null {
      return webRequestBefore;
    },
    get runtimeMessage():
      | ((message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => unknown)
      | null {
      return runtimeMessage;
    },
    get webNavigationBefore(): WebNavigationBeforeListener | null {
      return webNavigationBefore;
    },
    get webNavigationError(): WebNavigationErrorListener | null {
      return webNavigationError;
    },
    get webRequestError(): WebRequestErrorListener | null {
      return webRequestError;
    },
  };
}

void describe('background listeners blocked-screen routing', () => {
  void test('keeps runtime message channel open until async handlers send a response', async () => {
    const harness = createListenerHarness({
      handleRuntimeMessage: () => Promise.resolve({ success: true, id: 'request-1' }),
    });
    assert.ok(harness.runtimeMessage);

    const responses: unknown[] = [];
    const keepAlive = harness.runtimeMessage(
      { action: 'submitBlockedDomainRequest' },
      { tab: { id: 1 } },
      (response) => {
        responses.push(response);
      }
    );

    assert.equal(keepAlive, true);
    await waitForAsyncListeners();
    assert.deepEqual(responses, [{ success: true, id: 'request-1' }]);
  });

  void test('registers path blocking for frame and ajax request types', () => {
    const harness = createListenerHarness();

    assert.ok(harness.webRequestBefore);
    assert.deepEqual(harness.beforeRequestFilters, [
      {
        urls: ['<all_urls>'],
        types: ['main_frame', 'sub_frame', 'xmlhttprequest', 'fetch'],
      },
    ]);
  });

  void test('redirects a main-frame timeout when native policy confirms the hostname is blocked', async () => {
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: () => Promise.resolve(true),
    });
    assert.ok(harness.webRequestError);

    harness.webRequestError({
      error: 'NS_ERROR_NET_TIMEOUT',
      tabId: 7,
      type: 'main_frame',
      url: 'https://blocked.example/lesson',
    } as WebRequest.OnErrorOccurredDetailsType);

    await waitForAsyncListeners();

    assert.deepEqual(harness.confirmCalls, [
      {
        tabId: 7,
        hostname: 'blocked.example',
        error: 'NS_ERROR_NET_TIMEOUT',
        origin: null,
        url: 'https://blocked.example/lesson',
      },
    ]);
    assert.deepEqual(harness.redirects, [
      {
        tabId: 7,
        hostname: 'blocked.example',
        error: 'NS_ERROR_NET_TIMEOUT',
        origin: null,
      },
    ]);
  });

  void test('does not redirect a main-frame refused connection when native policy says it is allowed', async () => {
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: () => Promise.resolve(false),
    });
    assert.ok(harness.webRequestError);

    harness.webRequestError({
      error: 'NS_ERROR_CONNECTION_REFUSED',
      tabId: 8,
      type: 'main_frame',
      url: 'https://allowed.example/lesson',
    } as WebRequest.OnErrorOccurredDetailsType);

    await waitForAsyncListeners();

    assert.equal(harness.confirmCalls.length, 1);
    assert.deepEqual(harness.redirects, []);
  });

  void test('keeps unknown-host main-frame redirects immediate without native confirmation', async () => {
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: () => Promise.reject(new Error('should not be called')),
    });
    assert.ok(harness.webRequestError);

    harness.webRequestError({
      error: 'NS_ERROR_UNKNOWN_HOST',
      tabId: 9,
      type: 'main_frame',
      url: 'https://missing.example/lesson',
    } as WebRequest.OnErrorOccurredDetailsType);

    await waitForAsyncListeners();

    assert.deepEqual(harness.confirmCalls, []);
    assert.deepEqual(harness.redirects, [
      {
        tabId: 9,
        hostname: 'missing.example',
        error: 'NS_ERROR_UNKNOWN_HOST',
        origin: null,
      },
    ]);
  });

  void test('uses webNavigation top-frame errors as a fallback for native-confirmed blocks', async () => {
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: () => Promise.resolve(true),
    });
    assert.ok(harness.webNavigationError);

    harness.webNavigationError({
      error: 'NS_ERROR_NET_TIMEOUT',
      frameId: 0,
      tabId: 10,
      url: 'https://navigation-blocked.example/lesson',
    });

    await waitForAsyncListeners();

    assert.deepEqual(harness.redirects, [
      {
        tabId: 10,
        hostname: 'navigation-blocked.example',
        error: 'NS_ERROR_NET_TIMEOUT',
        origin: null,
      },
    ]);
  });

  void test('preflights top-frame navigations through native policy before Firefox reports status 0', async () => {
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: () => Promise.resolve(true),
    });
    assert.ok(harness.webNavigationBefore);

    harness.webNavigationBefore({
      frameId: 0,
      tabId: 14,
      url: 'https://preflight-blocked.example/lesson',
    });

    await waitForAsyncListeners();

    assert.deepEqual(harness.confirmCalls, [
      {
        tabId: 14,
        hostname: 'preflight-blocked.example',
        error: 'OPENPATH_NATIVE_POLICY_BLOCKED',
        origin: null,
        url: 'https://preflight-blocked.example/lesson',
      },
    ]);
    assert.deepEqual(harness.redirects, [
      {
        tabId: 14,
        hostname: 'preflight-blocked.example',
        error: 'OPENPATH_NATIVE_POLICY_BLOCKED',
        origin: null,
      },
    ]);
  });

  void test('ignores stale native preflight confirmations after a newer top-frame navigation starts', async () => {
    let resolveFirstConfirmation: (confirmed: boolean) => void = () => undefined;
    const firstConfirmation = new Promise<boolean>((resolve) => {
      resolveFirstConfirmation = resolve;
    });
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: (context) =>
        context.hostname === 'slow-blocked.example' ? firstConfirmation : Promise.resolve(false),
    });
    assert.ok(harness.webNavigationBefore);

    harness.webNavigationBefore({
      frameId: 0,
      tabId: 15,
      url: 'https://slow-blocked.example/lesson',
    });
    harness.webNavigationBefore({
      frameId: 0,
      tabId: 15,
      url: 'https://allowed-after.example/lesson',
    });

    await waitForAsyncListeners();
    resolveFirstConfirmation(true);
    await waitForAsyncListeners();

    assert.deepEqual(harness.redirects, []);
  });

  void test('deduplicates webRequest and webNavigation redirects for the same blocked navigation', async () => {
    let resolveConfirmation: (confirmed: boolean) => void = () => undefined;
    const confirmation = new Promise<boolean>((resolve) => {
      resolveConfirmation = resolve;
    });
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: () => confirmation,
    });
    assert.ok(harness.webRequestError);
    assert.ok(harness.webNavigationError);

    const blockedNavigation = {
      error: 'NS_ERROR_NET_TIMEOUT',
      tabId: 12,
      url: 'https://deduped-blocked.example/lesson',
    };

    harness.webRequestError({
      ...blockedNavigation,
      type: 'main_frame',
    } as WebRequest.OnErrorOccurredDetailsType);
    harness.webNavigationError({
      ...blockedNavigation,
      frameId: 0,
    });

    await waitForAsyncListeners();
    assert.equal(harness.confirmCalls.length, 1);
    assert.deepEqual(harness.redirects, []);

    resolveConfirmation(true);
    await waitForAsyncListeners();

    assert.deepEqual(harness.redirects, [
      {
        tabId: 12,
        hostname: 'deduped-blocked.example',
        error: 'NS_ERROR_NET_TIMEOUT',
        origin: null,
      },
    ]);
  });

  void test('does not reload the blocked screen for late duplicate errors after redirecting', async () => {
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: () => Promise.resolve(true),
    });
    assert.ok(harness.webNavigationBefore);
    assert.ok(harness.webRequestError);

    const blockedUrl = 'https://late-duplicate.example/lesson';
    harness.webNavigationBefore({
      frameId: 0,
      tabId: 16,
      url: blockedUrl,
    });

    await waitForAsyncListeners();
    assert.deepEqual(harness.redirects, [
      {
        tabId: 16,
        hostname: 'late-duplicate.example',
        error: 'OPENPATH_NATIVE_POLICY_BLOCKED',
        origin: null,
      },
    ]);

    harness.webRequestError({
      error: 'NS_ERROR_NET_TIMEOUT',
      tabId: 16,
      type: 'main_frame',
      url: blockedUrl,
    } as WebRequest.OnErrorOccurredDetailsType);

    await waitForAsyncListeners();
    assert.deepEqual(harness.redirects, [
      {
        tabId: 16,
        hostname: 'late-duplicate.example',
        error: 'OPENPATH_NATIVE_POLICY_BLOCKED',
        origin: null,
      },
    ]);
  });

  void test('does not redirect when the tab already shows the blocked screen for the same hostname', async () => {
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: () => Promise.resolve(true),
      currentTabUrl:
        'moz-extension://unit-test/blocked/blocked.html?domain=late-duplicate.example&error=OPENPATH_NATIVE_POLICY_BLOCKED',
    });
    assert.ok(harness.webRequestError);

    harness.webRequestError({
      error: 'NS_ERROR_NET_TIMEOUT',
      tabId: 17,
      type: 'main_frame',
      url: 'https://late-duplicate.example/favicon.ico',
    } as WebRequest.OnErrorOccurredDetailsType);

    await waitForAsyncListeners();

    assert.deepEqual(harness.redirects, []);
  });

  void test('does not redirect subresource blocking errors to the blocked screen', async () => {
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: () => Promise.resolve(true),
    });
    assert.ok(harness.webRequestError);

    harness.webRequestError({
      error: 'NS_ERROR_NET_TIMEOUT',
      tabId: 11,
      type: 'xmlhttprequest',
      url: 'https://api.blocked.example/data.json',
    } as WebRequest.OnErrorOccurredDetailsType);

    await waitForAsyncListeners();

    assert.deepEqual(harness.confirmCalls, []);
    assert.deepEqual(harness.redirects, []);
    assert.equal(harness.addedBlocks.length, 1);
  });

  void test('auto-allows ajax errors from an allowed origin without redirecting', async () => {
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: () => Promise.resolve(true),
    });
    assert.ok(harness.webRequestError);

    harness.webRequestError({
      error: 'NS_ERROR_NET_TIMEOUT',
      originUrl: 'https://allowed.example/app',
      tabId: 13,
      type: 'xmlhttprequest',
      url: 'https://api.blocked.example/data.json',
    } as WebRequest.OnErrorOccurredDetailsType);

    await waitForAsyncListeners();

    assert.deepEqual(harness.confirmCalls, []);
    assert.deepEqual(harness.redirects, []);
    assert.deepEqual(harness.autoAllowCalls, [
      {
        tabId: 13,
        hostname: 'api.blocked.example',
        origin: 'https://allowed.example/app',
        requestType: 'xmlhttprequest',
        targetUrl: 'https://api.blocked.example/data.json',
      },
    ]);
  });
});
