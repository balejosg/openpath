import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('release quality gate falls back when gh commit-filtered run lookup is empty', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'openpath-gh-fallback-'));
  const fakeGh = path.join(tempDir, 'gh');
  const matchingSha = '93f8d1d585c87342b62d003c4377b65dd0d3ad8e';

  writeFileSync(
    fakeGh,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'run' && args[1] === 'list') {
  if (args.includes('--commit')) {
    console.log('[]');
  } else {
    console.log(JSON.stringify([{
      databaseId: 25008754860,
      status: 'completed',
      conclusion: 'success',
      headSha: '${matchingSha}',
      createdAt: '2026-04-27T17:05:33Z',
      url: 'https://example.invalid/run',
      workflowName: 'E2E Tests'
    }]));
  }
  process.exit(0);
}
if (args[0] === 'run' && args[1] === 'view') {
  console.log(JSON.stringify({
    status: 'completed',
    conclusion: 'success',
    headSha: '${matchingSha}',
    url: 'https://example.invalid/run',
    workflowName: 'E2E Tests',
    jobs: [{ name: 'E2E Summary', conclusion: 'success' }]
  }));
  process.exit(0);
}
console.error('unexpected gh call: ' + args.join(' '));
process.exit(2);
`,
    'utf8'
  );
  chmodSync(fakeGh, 0o755);

  const output = execFileSync(
    process.execPath,
    [
      'scripts/require-release-quality-gate.mjs',
      '--repo',
      'balejosg/Openpath',
      '--sha',
      matchingSha,
      '--require',
      'E2E Tests::E2E Summary',
      '--timeout-minutes',
      '1',
      '--poll-seconds',
      '1',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${tempDir}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    }
  );

  assert.match(output, /Release gate satisfied: E2E Tests \/ E2E Summary/);
});
