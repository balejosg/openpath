import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  buildPageActivityMessage,
  notifyPageActivity,
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
});
