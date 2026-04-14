import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';

await describe('e2e suite compatibility contract', async () => {
  await test('split e2e suites remain present for the teacher workflow regression lane', () => {
    const suiteFiles = [
      'e2e-admin-bootstrap.test.ts',
      'e2e-teacher-profile.test.ts',
      'e2e-teacher-requests.test.ts',
      'e2e-teacher-boundaries.test.ts',
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
