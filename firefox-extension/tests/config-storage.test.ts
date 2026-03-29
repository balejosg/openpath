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

function createMockBrowser(params: {
  storedConfig?: unknown;
  storageError?: Error;
  nativeResponse?: unknown;
  nativeError?: Error;
  onSave?: (value: unknown) => void;
}): unknown {
  return {
    storage: {
      sync: {
        get: (): Promise<unknown> => {
          if (params.storageError) {
            return Promise.reject(params.storageError);
          }
          return Promise.resolve(params.storedConfig ?? {});
        },
        set: (value: unknown): Promise<void> => {
          params.onSave?.(value);
          return Promise.resolve();
        },
      },
    },
    runtime: {
      sendNativeMessage: (): Promise<unknown> => {
        if (params.nativeError) {
          return Promise.reject(params.nativeError);
        }
        return Promise.resolve(
          params.nativeResponse ?? { success: false, error: 'native unavailable' }
        );
      },
    },
  };
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

  void test('hasValidRequestConfig requires enableRequests and endpoints', () => {
    assert.strictEqual(hasValidRequestConfig(DEFAULT_REQUEST_CONFIG), false);
    assert.strictEqual(
      hasValidRequestConfig({
        ...DEFAULT_REQUEST_CONFIG,
        requestApiUrl: 'https://api.example',
      }),
      true
    );
  });

  void test('loadRequestConfig merges stored config with defaults', async () => {
    setMockBrowser(
      createMockBrowser({
        storedConfig: {
          config: {
            requestApiUrl: 'https://api.example',
            sharedSecret: 'secret',
            requestTimeout: 1234,
          },
        },
      })
    );

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

  void test('loadRequestConfig falls back to native host config when storage is empty', async () => {
    setMockBrowser(
      createMockBrowser({
        nativeResponse: {
          success: true,
          requestApiUrl: 'https://native.example/',
          fallbackApiUrls: ['https://backup.example/'],
        },
      })
    );

    try {
      const loaded = await loadRequestConfig();
      assert.strictEqual(loaded.requestApiUrl, 'https://native.example');
      assert.deepStrictEqual(loaded.fallbackApiUrls, ['https://backup.example']);
      assert.strictEqual(loaded.enableRequests, true);
    } finally {
      clearMockBrowser();
    }
  });

  void test('loadRequestConfig keeps stored values ahead of native fallback', async () => {
    setMockBrowser(
      createMockBrowser({
        storedConfig: {
          config: {
            requestApiUrl: 'https://stored.example',
            fallbackApiUrls: ['https://stored-backup.example'],
            enableRequests: false,
          },
        },
        nativeResponse: {
          success: true,
          requestApiUrl: 'https://native.example',
          fallbackApiUrls: ['https://native-backup.example'],
        },
      })
    );

    try {
      const loaded = await loadRequestConfig();
      assert.strictEqual(loaded.requestApiUrl, 'https://stored.example');
      assert.deepStrictEqual(loaded.fallbackApiUrls, ['https://stored-backup.example']);
      assert.strictEqual(loaded.enableRequests, false);
    } finally {
      clearMockBrowser();
    }
  });

  void test('loadRequestConfig uses native fallback when storage read fails', async () => {
    setMockBrowser(
      createMockBrowser({
        storageError: new Error('storage unavailable'),
        nativeResponse: {
          success: true,
          apiUrl: 'https://native-only.example',
        },
      })
    );

    try {
      const loaded = await loadRequestConfig();
      assert.strictEqual(loaded.requestApiUrl, 'https://native-only.example');
      assert.deepStrictEqual(loaded.fallbackApiUrls, []);
    } finally {
      clearMockBrowser();
    }
  });

  void test('loadRequestConfig falls back to defaults when native config fails', async () => {
    setMockBrowser(
      createMockBrowser({
        nativeError: new Error('native unavailable'),
      })
    );

    try {
      const loaded = await loadRequestConfig();
      assert.deepStrictEqual(loaded, DEFAULT_REQUEST_CONFIG);
    } finally {
      clearMockBrowser();
    }
  });

  void test('saveRequestConfig persists merged config', async () => {
    let saved: unknown;
    setMockBrowser(
      createMockBrowser({
        onSave: (value) => {
          saved = value;
        },
      })
    );

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
