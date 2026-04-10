import assert from 'node:assert';
import { describe, test } from 'node:test';

import { main } from '../src/blocked-page.js';

class MockElement {
  textContent = '';
  value = '';
  disabled = false;
  readonly classList = {
    add: (): void => undefined,
    remove: (): void => undefined,
  };

  addEventListener(): void {
    return undefined;
  }
}

function clearBlockedPageGlobals(): void {
  const globalRecord = globalThis as {
    document?: unknown;
    navigator?: unknown;
    window?: unknown;
  };

  delete globalRecord.document;
  delete globalRecord.navigator;
  delete globalRecord.window;
}

void describe('blocked page entrypoint', () => {
  void test('renders display context from the blocked page query string', () => {
    clearBlockedPageGlobals();

    const elements = new Map(
      [
        'blocked-domain',
        'blocked-error',
        'blocked-origin',
        'go-back',
        'copy-domain',
        'request-reason',
        'submit-unblock-request',
      ].map((id) => [id, new MockElement()])
    );

    Object.defineProperties(globalThis, {
      document: {
        configurable: true,
        value: {
          getElementById: (id: string): MockElement | null => elements.get(id) ?? null,
        },
      },
      navigator: {
        configurable: true,
        value: {
          clipboard: {
            writeText: (): Promise<void> => Promise.resolve(),
          },
        },
      },
      window: {
        configurable: true,
        value: {
          history: { length: 1, back: (): void => undefined },
          location: {
            replace: (): void => undefined,
            search:
              '?blockedUrl=https%3A%2F%2Flearning.example%2Flesson&error=NS_ERROR_UNKNOWN_HOST',
          },
        },
      },
    });

    main();

    assert.equal(elements.get('blocked-domain')?.textContent, 'learning.example');
    assert.equal(elements.get('blocked-error')?.textContent, 'NS_ERROR_UNKNOWN_HOST');
    assert.equal(elements.get('blocked-origin')?.textContent, 'sin informacion');
  });
});
