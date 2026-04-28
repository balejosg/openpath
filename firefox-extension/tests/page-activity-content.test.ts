import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const extensionRoot = path.resolve(import.meta.dirname, '..');

async function readContentEntrypoint(): Promise<string> {
  return readFile(path.join(extensionRoot, 'src', 'page-activity-content.ts'), 'utf8');
}

void describe('page activity content script', () => {
  void test('uses a classic-script entrypoint loadable from manifest content_scripts', async () => {
    const source = await readContentEntrypoint();

    assert.doesNotMatch(source, /^\s*import\s/m);
    assert.doesNotMatch(source, /^\s*export\s/m);
    assert.match(source, /\(\(\): void => \{/);
    assert.match(source, /browser\?\.runtime/);
    assert.match(source, /chrome\?\.runtime/);
  });

  void test('reports page activity and page resource candidates through runtime messaging', async () => {
    const source = await readContentEntrypoint();

    assert.match(source, /openpathPageActivity/);
    assert.match(source, /openpathPageResourceCandidate/);
    assert.match(source, /openpath-page-resource-candidate/);
    assert.match(source, /window\.addEventListener\('message'/);
  });

  void test('installs page-world and DOM observers for dynamic AJAX resources', async () => {
    const source = await readContentEntrypoint();

    assert.match(source, /__openpathPageResourceObserverInstalled/);
    assert.match(source, /window\.fetch = function/);
    assert.match(source, /XMLHttpRequest\.prototype\.open/);
    assert.match(source, /MutationObserver/);
  });

  void test('executes the manifest entrypoint and relays observed resources', async () => {
    const testGlobal = globalThis as unknown as Record<string, unknown>;
    const originalBrowser = testGlobal.browser;
    const originalChrome = testGlobal.chrome;
    const originalDocument = testGlobal.document;
    const originalMutationObserver = testGlobal.MutationObserver;
    const originalWindow = testGlobal.window;

    const sentMessages: unknown[] = [];
    const appendedScripts: { remove(): void; textContent: string }[] = [];
    const scheduledCallbacks: (() => void)[] = [];
    const scheduledDelays: number[] = [];
    let messageListener:
      | ((event: { data?: unknown; origin?: string; source?: unknown }) => void)
      | undefined;
    let mutationCallback:
      | ((records: { addedNodes: unknown[]; attributeName?: string; target: unknown }[]) => void)
      | undefined;

    class FakeMutationObserver {
      constructor(
        callback: (
          records: { addedNodes: unknown[]; attributeName?: string; target: unknown }[]
        ) => void
      ) {
        mutationCallback = callback;
      }

      observe(target: unknown, options: unknown): void {
        assert.equal(target, fakeDocument);
        assert.deepEqual(options, {
          attributeFilter: ['src', 'href', 'rel', 'as'],
          attributes: true,
          childList: true,
          subtree: true,
        });
      }
    }

    const fakeDocument = {
      createElement(tagName: string): { remove(): void; textContent: string } {
        assert.equal(tagName, 'script');
        const script = {
          textContent: '',
          remove(): void {
            // The injected page-world script is removed immediately after injection.
          },
        };
        return script;
      },
      documentElement: undefined as
        | undefined
        | {
            appendChild(script: { remove(): void; textContent: string }): void;
          },
    };
    const appendTarget = {
      appendChild(script: { remove(): void; textContent: string }): void {
        appendedScripts.push(script);
      },
    };
    const fakeWindow = {
      addEventListener(
        type: string,
        callback: (event: { data?: unknown; origin?: string; source?: unknown }) => void
      ): void {
        if (type === 'message') {
          messageListener = callback;
        }
      },
      location: { href: 'https://allowed.example/app' },
      setTimeout(callback: () => void, delay: number): number {
        scheduledCallbacks.push(callback);
        scheduledDelays.push(delay);
        return scheduledDelays.length;
      },
    };

    Object.assign(testGlobal, {
      browser: {
        runtime: {
          sendMessage(message: unknown): Promise<void> {
            sentMessages.push(message);
            return Promise.resolve();
          },
        },
      },
      document: fakeDocument,
      MutationObserver: FakeMutationObserver,
      window: fakeWindow,
    });

    try {
      // @ts-expect-error page-activity-content is intentionally a classic script for manifest loading.
      await import('../src/page-activity-content.ts');

      assert.deepEqual(scheduledDelays, [0, 5, 25, 100, 500]);
      assert.equal(appendedScripts.length, 0);
      fakeDocument.documentElement = appendTarget;
      scheduledCallbacks[0]?.();
      assert.equal(appendedScripts.length, 1);
      assert.match(appendedScripts[0]?.textContent ?? '', /window\.fetch = function/);
      assert.deepEqual(sentMessages, [
        {
          action: 'openpathPageActivity',
          url: 'https://allowed.example/app',
        },
      ]);

      messageListener?.({
        data: {
          kind: 'fetch',
          source: 'openpath-page-resource-candidate',
          url: 'https://api.example/data.json',
        },
        origin: 'https://allowed.example',
      });
      mutationCallback?.([
        {
          addedNodes: [
            { src: 'https://cdn.example/pixel.png', tagName: 'IMG' },
            { href: 'https://cdn.example/app.css', rel: 'stylesheet', tagName: 'LINK' },
            {
              as: 'font',
              href: 'https://fonts.gstatic.com/s/inter/v12/font.woff2',
              rel: 'preload',
              tagName: 'LINK',
            },
          ],
          target: {},
        },
        {
          addedNodes: [],
          attributeName: 'src',
          target: { src: 'https://cdn.example/changed.js', tagName: 'SCRIPT' },
        },
      ]);

      assert.deepEqual(sentMessages.slice(1), [
        {
          action: 'openpathPageResourceCandidate',
          kind: 'fetch',
          pageUrl: 'https://allowed.example/app',
          resourceUrl: 'https://api.example/data.json',
        },
        {
          action: 'openpathPageResourceCandidate',
          kind: 'image',
          pageUrl: 'https://allowed.example/app',
          resourceUrl: 'https://cdn.example/pixel.png',
        },
        {
          action: 'openpathPageResourceCandidate',
          kind: 'stylesheet',
          pageUrl: 'https://allowed.example/app',
          resourceUrl: 'https://cdn.example/app.css',
        },
        {
          action: 'openpathPageResourceCandidate',
          kind: 'font',
          pageUrl: 'https://allowed.example/app',
          resourceUrl: 'https://fonts.gstatic.com/s/inter/v12/font.woff2',
        },
        {
          action: 'openpathPageResourceCandidate',
          kind: 'script',
          pageUrl: 'https://allowed.example/app',
          resourceUrl: 'https://cdn.example/changed.js',
        },
      ]);
    } finally {
      Object.assign(testGlobal, {
        browser: originalBrowser,
        chrome: originalChrome,
        document: originalDocument,
        MutationObserver: originalMutationObserver,
        window: originalWindow,
      });
    }
  });
});
