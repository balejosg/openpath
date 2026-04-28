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
type EvaluateBlockedPath = Parameters<typeof registerBackgroundListeners>[0]['evaluateBlockedPath'];
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
    evaluateBlockedPath?: EvaluateBlockedPath;
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
    evaluateBlockedPath:
      options.evaluateBlockedPath ?? ((): ReturnType<EvaluateBlockedPath> => null),
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

  void test('auto-allows page resource candidates reported by the content script', async () => {
    const harness = createListenerHarness();
    assert.ok(harness.runtimeMessage);

    const responses: unknown[] = [];
    const keepAlive = harness.runtimeMessage(
      {
        action: 'openpathPageResourceCandidate',
        kind: 'fetch',
        pageUrl: 'http://allowed.example/app',
        resourceUrl: 'http://api.allowed-cdn.example/data.json',
        tabId: 1,
      },
      { tab: { id: 9, url: 'http://allowed.example/fallback' } },
      (response) => {
        responses.push(response);
      }
    );

    assert.equal(keepAlive, true);
    await waitForAsyncListeners();
    assert.deepEqual(responses, [{ success: true }]);
    assert.deepEqual(harness.autoAllowCalls, [
      {
        tabId: 9,
        hostname: 'api.allowed-cdn.example',
        origin: 'http://allowed.example/app',
        requestType: 'xmlhttprequest',
        targetUrl: 'http://api.allowed-cdn.example/data.json',
      },
    ]);
  });

  void test('maps page subresource candidate kinds to auto-allow request types', async () => {
    const harness = createListenerHarness();
    assert.ok(harness.runtimeMessage);

    const candidates = [
      ['image', 'http://image.example/pixel.png', 'image'],
      ['script', 'http://script.example/asset.js', 'script'],
      ['stylesheet', 'http://style.example/site.css', 'stylesheet'],
      ['font', 'http://fonts.example/font.woff2', 'font'],
      ['xmlhttprequest', 'http://xhr.example/data.json', 'xmlhttprequest'],
      ['unknown', 'http://other.example/resource', 'other'],
    ] as const;

    for (const [kind, resourceUrl] of candidates) {
      harness.runtimeMessage(
        {
          action: 'openpathPageResourceCandidate',
          kind,
          pageUrl: 'http://allowed.example/app',
          resourceUrl,
          tabId: 3,
        },
        {},
        () => undefined
      );
    }

    await waitForAsyncListeners();
    assert.deepEqual(
      harness.autoAllowCalls.map((call) => ({
        hostname: call.hostname,
        requestType: call.requestType,
      })),
      [
        { hostname: 'image.example', requestType: 'image' },
        { hostname: 'script.example', requestType: 'script' },
        { hostname: 'style.example', requestType: 'stylesheet' },
        { hostname: 'fonts.example', requestType: 'font' },
        { hostname: 'xhr.example', requestType: 'xmlhttprequest' },
        { hostname: 'other.example', requestType: 'other' },
      ]
    );
  });

  void test('rejects malformed page resource candidates without delegating', async () => {
    const harness = createListenerHarness();
    assert.ok(harness.runtimeMessage);

    const responses: unknown[] = [];
    harness.runtimeMessage(
      {
        action: 'openpathPageResourceCandidate',
        pageUrl: 'http://allowed.example/app',
        tabId: 1,
      },
      { tab: { id: 1 } },
      (response) => {
        responses.push(response);
      }
    );

    await waitForAsyncListeners();
    assert.deepEqual(responses, [{ success: false, error: 'resourceUrl is required' }]);
    assert.deepEqual(harness.autoAllowCalls, []);
  });

  void test('registers request interception for all page resource types', () => {
    const harness = createListenerHarness();

    assert.ok(harness.webRequestBefore);
    assert.deepEqual(harness.beforeRequestFilters, [
      {
        urls: ['<all_urls>'],
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

  void test('starts auto-allow from page subresource requests before network timeout', async () => {
    const resourceTypes: WebRequest.ResourceType[] = ['script', 'image', 'stylesheet', 'font'];

    for (const requestType of resourceTypes) {
      const harness = createListenerHarness({
        confirmBlockedScreenNavigation: () => Promise.resolve(true),
      });
      assert.ok(harness.webRequestBefore);

      const result = harness.webRequestBefore({
        originUrl: 'https://allowed.example/app',
        tabId: 35,
        type: requestType,
        url: `https://${requestType}.blocked.example/resource`,
      } as WebRequest.OnBeforeRequestDetailsType);

      await waitForAsyncListeners();

      assert.equal(result, undefined);
      assert.deepEqual(harness.confirmCalls, []);
      assert.deepEqual(harness.redirects, []);
      assert.deepEqual(harness.autoAllowCalls, [
        {
          tabId: 35,
          hostname: `${requestType}.blocked.example`,
          origin: 'https://allowed.example/app',
          requestType,
          targetUrl: `https://${requestType}.blocked.example/resource`,
        },
      ]);
    }
  });

  void test('uses top-level tab URL as origin for stylesheet-initiated font subresources', async () => {
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: () => Promise.resolve(true),
      currentTabUrl: 'https://www.reddit.com/r/openpath',
    });
    assert.ok(harness.webRequestBefore);

    const result = harness.webRequestBefore({
      originUrl: 'https://fonts.googleapis.com/css2?family=Inter',
      tabId: 41,
      type: 'font',
      url: 'https://fonts.gstatic.com/s/inter/v12/font.woff2',
    } as WebRequest.OnBeforeRequestDetailsType);

    await waitForAsyncListeners();

    assert.equal(result, undefined);
    assert.deepEqual(harness.confirmCalls, []);
    assert.deepEqual(harness.redirects, []);
    assert.deepEqual(harness.autoAllowCalls, [
      {
        tabId: 41,
        hostname: 'fonts.gstatic.com',
        origin: 'https://www.reddit.com/r/openpath',
        requestType: 'font',
        targetUrl: 'https://fonts.gstatic.com/s/inter/v12/font.woff2',
      },
    ]);
  });

  void test('starts auto-allow when Firefox omits a usable tab id for a page subresource', async () => {
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: () => Promise.resolve(true),
    });
    assert.ok(harness.webRequestBefore);

    const result = harness.webRequestBefore({
      documentUrl: 'https://allowed.example/app',
      tabId: -1,
      type: 'script',
      url: 'https://cdn.blocked.example/asset.js',
    } as WebRequest.OnBeforeRequestDetailsType);

    await waitForAsyncListeners();

    assert.equal(result, undefined);
    assert.deepEqual(harness.confirmCalls, []);
    assert.deepEqual(harness.redirects, []);
    assert.deepEqual(harness.autoAllowCalls, [
      {
        tabId: -1,
        hostname: 'cdn.blocked.example',
        origin: 'https://allowed.example/app',
        requestType: 'script',
        targetUrl: 'https://cdn.blocked.example/asset.js',
      },
    ]);
  });

  void test('treats missing Firefox request type with page context as a generic page resource', async () => {
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: () => Promise.resolve(true),
    });
    assert.ok(harness.webRequestBefore);

    const result = harness.webRequestBefore({
      originUrl: 'https://allowed.example/app',
      tabId: 37,
      url: 'https://api.blocked.example/data.json',
    } as WebRequest.OnBeforeRequestDetailsType);

    await waitForAsyncListeners();

    assert.equal(result, undefined);
    assert.deepEqual(harness.confirmCalls, []);
    assert.deepEqual(harness.redirects, []);
    assert.deepEqual(harness.autoAllowCalls, [
      {
        tabId: 37,
        hostname: 'api.blocked.example',
        origin: 'https://allowed.example/app',
        requestType: 'other',
        targetUrl: 'https://api.blocked.example/data.json',
      },
    ]);
  });

  void test('does not auto-allow requests cancelled by blocked path policy', async () => {
    const harness = createListenerHarness({
      evaluateBlockedPath: () => ({ cancel: true, reason: 'BLOCKED_PATH_POLICY:test' }),
    });
    assert.ok(harness.webRequestBefore);

    const result = harness.webRequestBefore({
      originUrl: 'https://allowed.example/app',
      tabId: 36,
      type: 'script',
      url: 'https://cdn.blocked.example/private.js',
    } as WebRequest.OnBeforeRequestDetailsType);

    await waitForAsyncListeners();

    assert.deepEqual(result, { cancel: true });
    assert.deepEqual(harness.autoAllowCalls, []);
  });

  void test('auto-allows blocked page subresources from an allowed origin without redirecting', async () => {
    const resourceTypes: WebRequest.ResourceType[] = [
      'script',
      'image',
      'stylesheet',
      'font',
      'media',
      'imageset',
      'beacon',
      'ping',
      'websocket',
      'web_manifest',
      'json',
      'other',
    ];

    for (const requestType of resourceTypes) {
      const harness = createListenerHarness({
        confirmBlockedScreenNavigation: () => Promise.resolve(true),
      });
      assert.ok(harness.webRequestError);

      harness.webRequestError({
        error: 'NS_ERROR_NET_TIMEOUT',
        originUrl: 'https://allowed.example/app',
        tabId: 31,
        type: requestType,
        url: `https://${requestType}.blocked.example/resource`,
      } as WebRequest.OnErrorOccurredDetailsType);

      await waitForAsyncListeners();

      assert.deepEqual(harness.confirmCalls, []);
      assert.deepEqual(harness.redirects, []);
      assert.deepEqual(harness.autoAllowCalls, [
        {
          tabId: 31,
          hostname: `${requestType}.blocked.example`,
          origin: 'https://allowed.example/app',
          requestType,
          targetUrl: `https://${requestType}.blocked.example/resource`,
        },
      ]);
    }
  });

  void test('does not auto-allow blocked frame navigation errors', async () => {
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: () => Promise.resolve(true),
    });
    assert.ok(harness.webRequestError);

    harness.webRequestError({
      error: 'NS_ERROR_NET_TIMEOUT',
      originUrl: 'https://allowed.example/app',
      tabId: 32,
      type: 'sub_frame',
      url: 'https://embed.blocked.example/frame',
    } as WebRequest.OnErrorOccurredDetailsType);

    await waitForAsyncListeners();

    assert.deepEqual(harness.autoAllowCalls, []);
  });

  void test('uses the current tab URL as ajax origin when Firefox omits request origins', async () => {
    const harness = createListenerHarness({
      confirmBlockedScreenNavigation: () => Promise.resolve(true),
      currentTabUrl: 'https://allowed.example/app',
    });
    assert.ok(harness.webRequestError);

    harness.webRequestError({
      error: 'NS_ERROR_NET_TIMEOUT',
      tabId: 13,
      type: 'fetch',
      url: 'https://api.blocked.example/data.json',
    } as unknown as WebRequest.OnErrorOccurredDetailsType);

    await waitForAsyncListeners();

    assert.deepEqual(harness.confirmCalls, []);
    assert.deepEqual(harness.redirects, []);
    assert.deepEqual(harness.autoAllowCalls, [
      {
        tabId: 13,
        hostname: 'api.blocked.example',
        origin: 'https://allowed.example/app',
        requestType: 'fetch',
        targetUrl: 'https://api.blocked.example/data.json',
      },
    ]);
  });
});
