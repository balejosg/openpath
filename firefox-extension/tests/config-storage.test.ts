import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  DEFAULT_REQUEST_CONFIG,
  getRequestApiEndpoints,
  hasValidRequestConfig,
  loadRequestConfig,
  saveRequestConfig,
} from '../src/lib/config-storage.js';

function setMockBrowser(mock: unknown): void {
  Object.defineProperty(globalThis, 'browser', {
    value: mock,
    configurable: true,
  });
}

function clearMockBrowser(): void {
  const globalRec = globalThis as unknown as Record<string, unknown>;
  delete globalRec.browser;
}

void describe('config-storage', () => {
  void test('getRequestApiEndpoints returns primary + fallbacks', () => {
    const endpoints = getRequestApiEndpoints({
      ...DEFAULT_REQUEST_CONFIG,
      requestApiUrl: 'https://api.example',
      fallbackApiUrls: ['https://api-2.example', ''],
    });

    assert.deepStrictEqual(endpoints, ['https://api.example', 'https://api-2.example']);
  });

  void test('hasValidRequestConfig requires enableRequests, secret and endpoints', () => {
    assert.strictEqual(hasValidRequestConfig(DEFAULT_REQUEST_CONFIG), false);
    assert.strictEqual(
      hasValidRequestConfig({
        ...DEFAULT_REQUEST_CONFIG,
        requestApiUrl: 'https://api.example',
        sharedSecret: 'secret',
      }),
      true
    );
  });

  void test('loadRequestConfig merges stored config with defaults', async () => {
    setMockBrowser({
      storage: {
        sync: {
          get: () =>
            Promise.resolve({
              config: {
                requestApiUrl: 'https://api.example',
                sharedSecret: 'secret',
                requestTimeout: 1234,
              },
            }),
        },
      },
    });

    try {
      const loaded = await loadRequestConfig();
      assert.strictEqual(loaded.requestApiUrl, 'https://api.example');
      assert.strictEqual(loaded.sharedSecret, 'secret');
      assert.strictEqual(loaded.requestTimeout, 1234);
      assert.deepStrictEqual(loaded.fallbackApiUrls, []);
    } finally {
      clearMockBrowser();
    }
  });

  void test('saveRequestConfig persists merged config', async () => {
    let saved: unknown;
    setMockBrowser({
      storage: {
        sync: {
          set: (value: unknown) => {
            saved = value;
            return Promise.resolve();
          },
        },
      },
    });

    try {
      await saveRequestConfig({ requestApiUrl: 'https://api.example', sharedSecret: 'secret' });
      assert.deepStrictEqual(saved, {
        config: {
          ...DEFAULT_REQUEST_CONFIG,
          requestApiUrl: 'https://api.example',
          sharedSecret: 'secret',
        },
      });
    } finally {
      clearMockBrowser();
    }
  });
});
