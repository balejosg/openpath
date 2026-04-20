import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Browser } from 'webextension-polyfill';

import { createNativeMessagingClient } from '../src/lib/native-messaging-client.js';

function createBrowserStub(sendResult: unknown): Browser {
  return {
    runtime: {
      connectNative: () =>
        ({
          onDisconnect: {
            addListener: () => undefined,
          },
        }) as never,
      lastError: undefined,
      sendNativeMessage: () => Promise.resolve(sendResult as never),
    },
  } as unknown as Browser;
}

await describe('native messaging client', async () => {
  await test('maps native check responses to popup-friendly fields', async () => {
    const client = createNativeMessagingClient({
      browserApi: createBrowserStub({
        success: true,
        results: [
          { domain: 'example.com', in_whitelist: true, resolves: true, resolved_ip: '127.0.0.1' },
        ],
      }),
      hostName: 'whitelist_native_host',
    });

    assert.deepEqual(await client.checkDomains(['example.com']), {
      success: true,
      results: [
        { domain: 'example.com', inWhitelist: true, resolves: true, resolvedIp: '127.0.0.1' },
      ],
    });
  });

  await test('reports host availability from ping responses', async () => {
    const client = createNativeMessagingClient({
      browserApi: createBrowserStub({ success: true }),
      hostName: 'whitelist_native_host',
    });

    assert.equal(await client.isAvailable(), true);
  });
});
