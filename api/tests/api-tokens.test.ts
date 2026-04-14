import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';

await describe('api tokens suite compatibility contract', async () => {
  await test('split API token removal suites remain present', () => {
    const suiteFiles = ['api-tokens-auth-guards.test.ts', 'api-tokens-removed-procedures.test.ts'];

    for (const suiteFile of suiteFiles) {
      assert.equal(
        fs.existsSync(new URL(`./${suiteFile}`, import.meta.url)),
        true,
        `${suiteFile} is missing`
      );
    }
  });
});
