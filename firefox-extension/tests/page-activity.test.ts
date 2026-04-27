import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  buildPageActivityMessage,
  buildPageResourceCandidateMessage,
  buildPageResourceObserverScript,
  installPageResourceObserver,
  notifyPageActivity,
  notifyPageResourceCandidate,
  type PageActivityRuntime,
} from '../src/page-activity.js';

void describe('page activity content script', () => {
  void test('builds a minimal wake-up message for the background runtime', () => {
    assert.deepEqual(buildPageActivityMessage('https://allowed.example/app'), {
      action: 'openpathPageActivity',
      url: 'https://allowed.example/app',
    });
  });

  void test('sends wake-up messages without surfacing runtime failures to the page', async () => {
    const sentMessages: unknown[] = [];
    const runtime: PageActivityRuntime = {
      sendMessage: (message) => {
        sentMessages.push(message);
        return Promise.reject(new Error('background not ready yet'));
      },
    };

    notifyPageActivity(runtime, 'https://allowed.example/app');
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(sentMessages, [
      {
        action: 'openpathPageActivity',
        url: 'https://allowed.example/app',
      },
    ]);
  });

  void test('builds page resource candidate messages for proactive auto-allow', () => {
    assert.deepEqual(
      buildPageResourceCandidateMessage(
        'https://allowed.example/app',
        'https://cdn.example/app.js',
        'script'
      ),
      {
        action: 'openpathPageResourceCandidate',
        kind: 'script',
        pageUrl: 'https://allowed.example/app',
        resourceUrl: 'https://cdn.example/app.js',
      }
    );
  });

  void test('sends page resource candidates without surfacing runtime failures', async () => {
    const sentMessages: unknown[] = [];
    const runtime: PageActivityRuntime = {
      sendMessage: (message) => {
        sentMessages.push(message);
        return Promise.reject(new Error('background not ready yet'));
      },
    };

    notifyPageResourceCandidate(
      runtime,
      'https://api.example/data.json',
      'fetch',
      'https://allowed.example/app'
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(sentMessages, [
      {
        action: 'openpathPageResourceCandidate',
        kind: 'fetch',
        pageUrl: 'https://allowed.example/app',
        resourceUrl: 'https://api.example/data.json',
      },
    ]);
  });

  void test('injects page observers for async and subresource URL candidates', () => {
    const script = buildPageResourceObserverScript();

    assert.match(script, /window\.fetch/);
    assert.match(script, /XMLHttpRequest/);
    assert.match(script, /HTMLImageElement/);
    assert.match(script, /HTMLScriptElement/);
    assert.match(script, /HTMLLinkElement/);
    assert.match(script, /openpath-page-resource-candidate/);
    assert.match(script, /__openpathPageResourceObserverInstalled/);
  });

  void test('relays page observer messages to the background runtime', () => {
    const sentMessages: unknown[] = [];
    let listener:
      | ((event: { data?: unknown; origin?: string; source?: unknown }) => void)
      | undefined;
    const scriptElement = {
      removeCalls: 0,
      textContent: '',
      remove(): void {
        this.removeCalls += 1;
      },
    };
    const runtime: PageActivityRuntime = {
      sendMessage: (message): void => {
        sentMessages.push(message);
      },
    };
    const pageWindow = {};
    const runtimeGlobal = {
      addEventListener(
        type: string,
        callback: (event: { data?: unknown; origin?: string; source?: unknown }) => void
      ): void {
        if (type === 'message') {
          listener = callback;
        }
      },
      document: {
        createElement(tagName: string): typeof scriptElement {
          assert.equal(tagName, 'script');
          return scriptElement;
        },
        documentElement: {
          appended: [] as unknown[],
          appendChild(node: unknown): void {
            this.appended.push(node);
          },
        },
      },
      location: { href: 'https://allowed.example/app' },
      window: pageWindow,
    };

    installPageResourceObserver(runtime, runtimeGlobal);
    listener?.({
      data: {
        source: 'openpath-page-resource-candidate',
        kind: 'image',
        url: 'https://cdn.example/pixel.png',
      },
      origin: 'https://allowed.example',
      source: pageWindow,
    });

    assert.match(scriptElement.textContent, /window\.fetch/);
    assert.equal(scriptElement.removeCalls, 1);
    assert.deepEqual(sentMessages, [
      {
        action: 'openpathPageResourceCandidate',
        kind: 'image',
        pageUrl: 'https://allowed.example/app',
        resourceUrl: 'https://cdn.example/pixel.png',
      },
    ]);
  });

  void test('relays page observer messages when Firefox omits postMessage source', () => {
    const sentMessages: unknown[] = [];
    let appendCalls = 0;
    let removeCalls = 0;
    let listener:
      | ((event: { data?: unknown; origin?: string; source?: unknown }) => void)
      | undefined;
    const runtime: PageActivityRuntime = {
      sendMessage: (message): void => {
        sentMessages.push(message);
      },
    };
    const runtimeGlobal = {
      addEventListener(
        type: string,
        callback: (event: { data?: unknown; origin?: string; source?: unknown }) => void
      ): void {
        if (type === 'message') {
          listener = callback;
        }
      },
      document: {
        createElement(): { remove(): void; textContent: string } {
          return {
            textContent: '',
            remove(): void {
              removeCalls += 1;
            },
          };
        },
        documentElement: {
          appendChild(): void {
            appendCalls += 1;
          },
        },
      },
      location: { href: 'https://allowed.example/app' },
      window: {},
    };

    installPageResourceObserver(runtime, runtimeGlobal);
    assert.equal(appendCalls, 1);
    assert.equal(removeCalls, 1);
    listener?.({
      data: {
        source: 'openpath-page-resource-candidate',
        kind: 'fetch',
        url: 'https://api.example/data.json',
      },
      origin: 'https://allowed.example',
      source: null,
    });
    listener?.({
      data: {
        source: 'openpath-page-resource-candidate',
        kind: 'script',
        url: 'https://evil.example/app.js',
      },
      origin: 'https://evil.example',
      source: null,
    });

    assert.deepEqual(sentMessages, [
      {
        action: 'openpathPageResourceCandidate',
        kind: 'fetch',
        pageUrl: 'https://allowed.example/app',
        resourceUrl: 'https://api.example/data.json',
      },
    ]);
  });

  void test('defers page observer injection until the document has an append target', () => {
    const sentMessages: unknown[] = [];
    interface PageMessageEvent {
      data?: unknown;
      origin?: string;
      source?: unknown;
    }
    const listeners = new Map<string, (event: PageMessageEvent) => void>();
    const scriptElement = {
      removeCalls: 0,
      textContent: '',
      remove(): void {
        this.removeCalls += 1;
      },
    };
    const appended: unknown[] = [];
    const runtime: PageActivityRuntime = {
      sendMessage: (message): void => {
        sentMessages.push(message);
      },
    };
    const runtimeGlobal = {
      addEventListener(type: string, callback: (event: PageMessageEvent) => void): void {
        listeners.set(type, callback);
      },
      document: {
        createElement(): typeof scriptElement {
          return scriptElement;
        },
        documentElement: undefined as undefined | { appendChild(node: unknown): void },
        head: undefined as undefined | { appendChild(node: unknown): void },
      },
      location: { href: 'https://allowed.example/app' },
      window: {},
    };

    installPageResourceObserver(runtime, runtimeGlobal);
    assert.equal(appended.length, 0);
    assert.equal(scriptElement.removeCalls, 0);

    runtimeGlobal.document.documentElement = {
      appendChild(node: unknown): void {
        appended.push(node);
      },
    };
    listeners.get('DOMContentLoaded')?.({});

    assert.deepEqual(appended, [scriptElement]);
    assert.match(scriptElement.textContent, /window\.fetch/);
    assert.equal(scriptElement.removeCalls, 1);
  });

  void test('retries page observer injection before DOMContentLoaded when an append target appears', () => {
    interface PageMessageEvent {
      data?: unknown;
      origin?: string;
      source?: unknown;
    }
    const listeners = new Map<string, (event: PageMessageEvent) => void>();
    const scheduled: { delay: number; callback: () => void }[] = [];
    const scriptElement = {
      removeCalls: 0,
      textContent: '',
      remove(): void {
        this.removeCalls += 1;
      },
    };
    const appended: unknown[] = [];
    const runtimeGlobal = {
      addEventListener(type: string, callback: (event: PageMessageEvent) => void): void {
        listeners.set(type, callback);
      },
      document: {
        createElement(): typeof scriptElement {
          return scriptElement;
        },
        documentElement: undefined as undefined | { appendChild(node: unknown): void },
        head: undefined as undefined | { appendChild(node: unknown): void },
      },
      location: { href: 'https://allowed.example/app' },
      setTimeout(callback: () => void, delay: number): void {
        scheduled.push({ callback, delay });
      },
      window: {},
    };

    installPageResourceObserver(undefined, runtimeGlobal);
    assert.deepEqual(
      scheduled.map((timer) => timer.delay),
      [0, 5, 25, 100, 500]
    );
    assert.equal(appended.length, 0);

    runtimeGlobal.document.documentElement = {
      appendChild(node: unknown): void {
        appended.push(node);
      },
    };
    scheduled[0]?.callback();

    assert.deepEqual(appended, [scriptElement]);
    assert.match(scriptElement.textContent, /window\.fetch/);
    assert.equal(scriptElement.removeCalls, 1);
    assert.ok(listeners.has('DOMContentLoaded'));
  });

  void test('keeps retrying page observer injection after an early document_start append', () => {
    interface PageMessageEvent {
      data?: unknown;
      origin?: string;
      source?: unknown;
    }
    const listeners = new Map<string, (event: PageMessageEvent) => void>();
    const scheduled: { delay: number; callback: () => void }[] = [];
    let createdScripts = 0;
    const appended: string[] = [];
    const runtimeGlobal = {
      addEventListener(type: string, callback: (event: PageMessageEvent) => void): void {
        listeners.set(type, callback);
      },
      document: {
        createElement(): { remove(): void; textContent: string } {
          createdScripts += 1;
          return {
            textContent: '',
            remove(): void {
              // The injected page script is intentionally short-lived.
            },
          };
        },
        documentElement: {
          appendChild(): void {
            appended.push('documentElement');
          },
        },
        head: undefined as undefined | { appendChild(): void },
      },
      location: { href: 'https://allowed.example/app' },
      setTimeout(callback: () => void, delay: number): void {
        scheduled.push({ callback, delay });
      },
      window: {},
    };

    installPageResourceObserver(undefined, runtimeGlobal);

    assert.deepEqual(
      scheduled.map((timer) => timer.delay),
      [0, 5, 25, 100, 500]
    );
    assert.deepEqual(appended, ['documentElement']);

    runtimeGlobal.document.head = {
      appendChild(): void {
        appended.push('head');
      },
    };
    scheduled[0]?.callback();
    listeners.get('DOMContentLoaded')?.({});

    assert.deepEqual(appended, ['documentElement', 'head', 'head']);
    assert.equal(createdScripts, 3);
  });

  void test('reports DOM subresource candidates from added and changed nodes', () => {
    const sentMessages: unknown[] = [];
    const ignoredEvents: string[] = [];
    let appendCalls = 0;
    let removeCalls = 0;
    let mutationCallback:
      | ((records: { addedNodes?: unknown[]; attributeName?: string; target?: unknown }[]) => void)
      | undefined;
    const runtime: PageActivityRuntime = {
      sendMessage: (message): void => {
        sentMessages.push(message);
      },
    };
    class FakeMutationObserver {
      constructor(
        callback: (
          records: { addedNodes?: unknown[]; attributeName?: string; target?: unknown }[]
        ) => void
      ) {
        mutationCallback = callback;
      }

      observe(target: unknown, options: unknown): void {
        assert.equal(target, runtimeGlobal.document);
        assert.deepEqual(options, {
          attributeFilter: ['src', 'href'],
          attributes: true,
          childList: true,
          subtree: true,
        });
      }
    }
    const runtimeGlobal = {
      addEventListener(type: string): void {
        ignoredEvents.push(type);
      },
      document: {
        createElement(): { remove(): void; textContent: string } {
          return {
            textContent: '',
            remove(): void {
              removeCalls += 1;
            },
          };
        },
        documentElement: {
          appendChild(): void {
            appendCalls += 1;
          },
        },
      },
      location: { href: 'https://allowed.example/app' },
      MutationObserver: FakeMutationObserver,
      window: {},
    };

    installPageResourceObserver(runtime, runtimeGlobal);
    assert.equal(appendCalls, 1);
    assert.equal(removeCalls, 1);
    assert.deepEqual(ignoredEvents, ['message', 'DOMContentLoaded']);
    mutationCallback?.([
      {
        addedNodes: [
          { tagName: 'IMG', src: 'https://cdn.example/pixel.png' },
          { tagName: 'SCRIPT', src: 'https://cdn.example/app.js' },
          { href: 'https://cdn.example/app.css', rel: 'stylesheet', tagName: 'LINK' },
        ],
      },
      {
        attributeName: 'src',
        target: { tagName: 'IMG', src: 'https://cdn.example/changed.png' },
      },
    ]);

    assert.deepEqual(sentMessages, [
      {
        action: 'openpathPageResourceCandidate',
        kind: 'image',
        pageUrl: 'https://allowed.example/app',
        resourceUrl: 'https://cdn.example/pixel.png',
      },
      {
        action: 'openpathPageResourceCandidate',
        kind: 'script',
        pageUrl: 'https://allowed.example/app',
        resourceUrl: 'https://cdn.example/app.js',
      },
      {
        action: 'openpathPageResourceCandidate',
        kind: 'stylesheet',
        pageUrl: 'https://allowed.example/app',
        resourceUrl: 'https://cdn.example/app.css',
      },
      {
        action: 'openpathPageResourceCandidate',
        kind: 'image',
        pageUrl: 'https://allowed.example/app',
        resourceUrl: 'https://cdn.example/changed.png',
      },
    ]);
  });
});
