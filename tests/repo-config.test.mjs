import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const testsDir = dirname(currentFilePath);
const projectRoot = resolve(testsDir, '..');

function readPackageJson() {
  return JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
}

describe('repository verification contract', () => {
  test('verify:full runs coverage before unit, e2e, and security stages', () => {
    const packageJson = readPackageJson();
    const verifyFull = packageJson.scripts['verify:full'];

    assert.equal(
      verifyFull,
      'npm run verify:static && npm run verify:checks && npm run verify:coverage && npm run verify:unit && npm run e2e:full && npm run verify:security'
    );
  });

  test('pre-commit delegates coverage to verify:full instead of running it as a fourth step', () => {
    const hook = readFileSync(resolve(projectRoot, '.husky/pre-commit'), 'utf8');

    assert.ok(
      hook.includes('[3/3] Running full verification suite...'),
      'pre-commit should collapse coverage into the full verification step'
    );
    assert.ok(
      !hook.includes('npm run verify:coverage'),
      'pre-commit should not rerun verify:coverage after verify:full'
    );
    assert.ok(!hook.includes('[4/4]'), 'pre-commit should no longer advertise a fourth stage');
  });
});
