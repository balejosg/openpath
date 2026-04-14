import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';

await describe('backup suite compatibility contract', async () => {
  await test('split backup suites remain present for backup router regressions', () => {
    const suiteFiles = [
      'backup-surface.test.ts',
      'backup-auth.test.ts',
      'backup-recording.test.ts',
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
