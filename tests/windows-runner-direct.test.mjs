import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { readPackageJson, readText } from './repo-config/support.mjs';

const currentFilePath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(currentFilePath), '..');
const scriptPath = resolve(projectRoot, 'scripts/run-windows-runner-direct.mjs');

function runDirectDiagnostic(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      OPENPATH_WINDOWS_DIRECT_DRY_RUN: '1',
    },
  });
}

describe('direct OpenPath Windows runner diagnostic', () => {
  test('package.json exposes the direct Windows diagnostic entrypoint', () => {
    const packageJson = readPackageJson();

    assert.equal(
      packageJson.scripts['diagnostics:windows:direct'],
      'node scripts/run-windows-runner-direct.mjs'
    );
  });

  test('plans a direct Proxmox guest-agent diagnostic for the Windows runner VM', () => {
    const result = runDirectDiagnostic([]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /artifact_dir=/);
    assert.match(result.stdout, /ssh whitelist-proxmox qm guest exec 103 -- powershell\.exe/);
    assert.match(result.stdout, /direct OpenPath Windows runner diagnostic complete/);
  });

  test('direct diagnostic resets the runner before invoking isolated Pester', () => {
    const script = readText('scripts/run-windows-runner-direct.mjs');

    assert.match(script, /reset-self-hosted-windows-runner\.ps1/);
    assert.match(script, /run-windows-pester-isolated\.ps1/);
    assert.match(script, /windows-test-results\.xml/);
    assert.match(script, /qm guest exec/);
  });
});
