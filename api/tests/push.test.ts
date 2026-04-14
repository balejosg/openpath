import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';

await describe('push suite compatibility contract', async () => {
  await test('split push suites remain present for push notification regressions', () => {
    const suiteFiles = [
      'push-vapid.test.ts',
      'push-subscription.test.ts',
      'push-status.test.ts',
      'push-unsubscribe.test.ts',
    ];

    for (const suiteFile of suiteFiles) {
      assert.equal(
        fs.existsSync(new URL(`./${suiteFile}`, import.meta.url)),
        true,
        `${suiteFile} is missing`
      );
    }
  });
});
