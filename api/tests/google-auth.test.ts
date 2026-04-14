import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';

await describe('google auth suite compatibility contract', async () => {
  await test('split google auth suites remain present for google login regressions', () => {
    const suiteFiles = [
      'google-auth-config.test.ts',
      'google-auth-misconfig.test.ts',
      'google-auth-invalid-token.test.ts',
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
