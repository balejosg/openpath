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
        assert.equal(type, 'message');
        listener = callback;
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
        assert.equal(type, 'message');
        listener = callback;
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
});
