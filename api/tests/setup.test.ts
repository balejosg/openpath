import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';

await describe('setup suite compatibility contract', async () => {
  await test('split setup suites remain present for the setup router', () => {
    const suiteFiles = [
      'setup-status.test.ts',
      'setup-first-admin.test.ts',
      'setup-token-validation.test.ts',
      'setup-auth-guards.test.ts',
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
