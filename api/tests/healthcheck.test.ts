import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';

await describe('healthcheck suite compatibility contract', async () => {
  await test('split healthcheck suites remain present for router regressions', () => {
    const suiteFiles = [
      'healthcheck-live.test.ts',
      'healthcheck-ready.test.ts',
      'healthcheck-surface.test.ts',
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
