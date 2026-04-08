import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { DOCKER_MANIFEST_CASES } from '../scripts/generate-docker-manifests.mjs';

const currentFilePath = fileURLToPath(import.meta.url);
const testsDir = dirname(currentFilePath);
const projectRoot = resolve(testsDir, '..');

function readPackageJson() {
  return JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(projectRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
  return readFileSync(resolve(projectRoot, relativePath), 'utf8');
}

function extractWorkflowJobBlock(workflowText, jobId) {
  const jobPattern = new RegExp(`(^  ${jobId}:\\n[\\s\\S]*?)(?=^  [a-z0-9-]+:\\n|\\Z)`, 'm');
  const match = workflowText.match(jobPattern);

  assert.ok(match, `workflow should define a ${jobId} job block`);
  return match[1];
}

function listStableReleaseTags() {
  const tags = new Set();
  const tagsDir = resolve(projectRoot, '.git/refs/tags');
  const packedRefsPath = resolve(projectRoot, '.git/packed-refs');

  function collectTagRefs(directory, prefix = '') {
    if (!existsSync(directory)) {
      return;
    }

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        collectTagRefs(resolve(directory, entry.name), relativeName);
        continue;
      }

      if (entry.isFile() && relativeName.startsWith('v')) {
        tags.add(relativeName);
      }
    }
  }

  collectTagRefs(tagsDir);

  if (existsSync(packedRefsPath)) {
    const packedRefs = readFileSync(packedRefsPath, 'utf8');

    for (const line of packedRefs.split(/\r?\n/)) {
      if (!line || line.startsWith('#') || line.startsWith('^')) {
        continue;
      }

      const [, ref] = line.split(' ');
      const tagName = ref?.replace(/^refs\/tags\//, '') ?? '';
      if (tagName.startsWith('v')) {
        tags.add(tagName);
      }
    }
  }

  return [...tags].sort((left, right) =>
    compareSemver(right.replace(/^v/, ''), left.replace(/^v/, ''))
  );
}

function compareSemver(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
}

function walkTextFiles(relativePath) {
  const root = resolve(projectRoot, relativePath);
  const entries = readdirSync(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const nextRelativePath = `${relativePath}/${entry.name}`;
    const nextAbsolutePath = resolve(projectRoot, nextRelativePath);

    if (entry.isDirectory()) {
      files.push(...walkTextFiles(nextRelativePath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stat = statSync(nextAbsolutePath);
    if (stat.size > 1024 * 1024) {
      continue;
    }

    files.push(nextRelativePath);
  }

  return files;
}

describe('repository verification contract', () => {
  test('workflow helpers pin Node 24 compatible GitHub Action majors', () => {
    const cases = [
      {
        relativePath: '.github/workflows/ci.yml',
        required: ['actions/checkout@v6'],
        forbidden: ['actions/checkout@v4'],
      },
      {
        relativePath: '.github/workflows/verify-trailers.yml',
        required: ['actions/checkout@v6'],
        forbidden: ['actions/checkout@v4'],
      },
      {
        relativePath: '.github/workflows/security.yml',
        required: ['actions/setup-node@v6'],
        forbidden: ['actions/setup-node@v4'],
      },
      {
        relativePath: '.github/actions/setup-node/action.yml',
        required: ['actions/setup-node@v6'],
        forbidden: ['actions/setup-node@v4'],
      },
      {
        relativePath: '.github/workflows/reusable-docker.yml',
        required: ['docker/login-action@v4'],
        forbidden: ['FORCE_JAVASCRIPT_ACTIONS_TO_NODE24', 'docker/login-action@v3'],
      },
      {
        relativePath: '.github/actions/docker-build/action.yml',
        required: ['docker/setup-buildx-action@v4', 'docker/build-push-action@v7'],
        forbidden: ['docker/setup-buildx-action@v3', 'docker/build-push-action@v6'],
      },
    ];

    for (const { relativePath, required, forbidden } of cases) {
      const content = readText(relativePath);

      for (const version of required) {
        assert.ok(content.includes(version), `${relativePath} should include ${version}`);
      }

      for (const version of forbidden) {
        assert.ok(!content.includes(version), `${relativePath} should not include ${version}`);
      }
    }
  });

  test('required Windows CI keeps the direct Pester lane, reports lingering processes, and cleans orphaned console hosts', () => {
    const ciWorkflow = readText('.github/workflows/ci.yml');
    const linuxJobBlock = extractWorkflowJobBlock(ciWorkflow, 'test-linux-dnsmasq');
    const windowsJobBlock = extractWorkflowJobBlock(ciWorkflow, 'test-windows');
    const windowsProcessReporter = readText('tests/e2e/ci/report-windows-processes.ps1');

    assert.ok(
      ciWorkflow.includes('runs-on: windows-2025'),
      'ci.yml should pin the required Windows Pester lane to windows-2025'
    );
    assert.ok(
      !ciWorkflow.includes('runs-on: windows-2022'),
      'ci.yml should stop pinning the required Windows Pester lane to windows-2022'
    );
    assert.ok(
      !ciWorkflow.includes('persist-credentials: true'),
      'ci.yml should not persist checkout credentials because the required CI lanes do not need authenticated git after checkout'
    );
    assert.ok(
      linuxJobBlock.includes('uses: actions/checkout@v6'),
      'ci.yml should keep the Linux lane on actions/checkout because the Windows-specific checkout workaround should stay isolated to the required Pester job'
    );
    assert.ok(
      linuxJobBlock.includes('persist-credentials: false'),
      'ci.yml should disable persisted checkout credentials for the Linux lane checkout'
    );
    assert.ok(
      windowsJobBlock.includes('uses: actions/checkout@v6'),
      'ci.yml should use the standard checkout action again inside the Windows lane'
    );
    assert.ok(
      windowsJobBlock.includes('persist-credentials: false'),
      'ci.yml should disable persisted checkout credentials for the Windows lane checkout'
    );
    assert.ok(
      !ciWorkflow.includes('runs-on: windows-latest'),
      'ci.yml should avoid windows-latest for the required Windows Pester lane'
    );
    assert.ok(
      !ciWorkflow.includes('GITHUB_STEP_SUMMARY'),
      'ci.yml should avoid inline Windows step summary processing in the required Pester job'
    );
    assert.ok(
      !ciWorkflow.includes('name: Upload test results'),
      'ci.yml should keep artifact upload out of the required Windows Pester lane'
    );
    assert.ok(
      windowsJobBlock.includes('name: Install Pester'),
      'ci.yml should install Pester explicitly in the Windows lane before running the suite'
    );
    assert.ok(
      windowsJobBlock.includes('name: Capture Windows process snapshot'),
      'ci.yml should capture a Windows process snapshot before the direct Pester step'
    );
    assert.ok(
      windowsJobBlock.includes('Import-Module Pester -MinimumVersion 5.0 -ErrorAction Stop'),
      'ci.yml should import a compatible Pester version explicitly in the Windows lane'
    );
    assert.ok(
      !windowsJobBlock.includes('git init .'),
      'ci.yml should not keep the manual Windows checkout workaround once the lane returns to the direct Pester pattern'
    );
    assert.ok(
      !windowsJobBlock.includes('git fetch --no-tags --depth=1 origin'),
      'ci.yml should not keep the manual Windows fetch workaround once the lane returns to the direct Pester pattern'
    );
    assert.ok(
      !ciWorkflow.includes('tests/e2e/ci/run-windows-unit-tests.ps1'),
      'ci.yml should stop routing the Windows lane through the isolated CI helper'
    );
    assert.ok(
      !ciWorkflow.includes('manage-windows-job-processes.ps1'),
      'ci.yml should stop routing the Windows lane through the old process cleanup helper'
    );
    assert.ok(
      ciWorkflow.includes('tests/e2e/ci/report-windows-processes.ps1') ||
        ciWorkflow.includes('tests\\e2e\\ci\\report-windows-processes.ps1'),
      'ci.yml should route Windows process diagnostics through the shared reporting helper'
    );
    assert.ok(
      !ciWorkflow.includes('name: Capture Windows job process baseline'),
      'ci.yml should not capture a Windows process baseline once the lane returns to the direct Pester pattern'
    );
    assert.ok(
      !ciWorkflow.includes('name: Clean Windows orphaned shells'),
      'ci.yml should not run the explicit Windows orphan cleanup step once the lane returns to the direct Pester pattern'
    );
    assert.ok(
      !ciWorkflow.includes('name: Re-scan Windows processes after idle delay'),
      'ci.yml should not re-scan the Windows process table once the lane returns to the direct Pester pattern'
    );
    assert.ok(
      windowsJobBlock.includes('name: Report Windows process diagnostics'),
      'ci.yml should log bounded Windows process diagnostics before the runner reaches orphan cleanup'
    );
    assert.ok(
      windowsJobBlock.includes('name: Cleanup lingering Windows console hosts'),
      'ci.yml should clean lingering Windows console hosts before the runner reaches orphan cleanup'
    );
    assert.ok(
      ciWorkflow.includes(
        'outputs:\n      tests_passed: ${{ steps.job-status.outputs.tests_passed }}'
      ),
      'ci.yml should expose explicit tests_passed outputs for required CI lanes'
    );
    assert.ok(
      windowsJobBlock.includes('name: Record Windows lane outcome'),
      'ci.yml should record an explicit Windows lane outcome instead of trusting needs.test-windows.result'
    );
    assert.ok(
      !windowsJobBlock.includes('shell: bash'),
      'ci.yml should avoid bash in the Windows lane'
    );
    assert.ok(
      !windowsJobBlock.includes('shell: cmd'),
      'ci.yml should not route the Windows lane through cmd once the direct pwsh Pester pattern is restored'
    );
    assert.ok(
      windowsJobBlock.includes('shell: pwsh'),
      'ci.yml should run the Windows lane directly in pwsh'
    );
    assert.ok(
      windowsJobBlock.includes('Set-StrictMode -Off'),
      'ci.yml should preserve the legacy non-strict Pester runtime used by the required Windows suite'
    );
    assert.ok(
      windowsJobBlock.includes("$config.Run.Path = 'windows/tests'"),
      'ci.yml should point the Windows lane at the real Pester suite directory'
    );
    assert.ok(
      windowsJobBlock.includes('$config.Run.PassThru = $true'),
      'ci.yml should request a Pester result object so FailedCount reflects the real suite outcome'
    );
    assert.ok(
      windowsJobBlock.includes("$config.TestResult.OutputPath = 'windows-test-results.xml'"),
      'ci.yml should keep the Windows lane writing its NUnit XML result file'
    );
    assert.ok(
      windowsJobBlock.includes('Invoke-Pester -Configuration $config'),
      'ci.yml should continue to execute the real Pester suite'
    );
    assert.ok(
      windowsJobBlock.includes(
        "throw 'Windows Pester suite did not produce windows-test-results.xml.'"
      ),
      'ci.yml should fail fast if the Windows lane does not emit its expected NUnit XML file'
    );
    assert.ok(
      windowsJobBlock.includes("throw 'Invoke-Pester returned no result object.'"),
      'ci.yml should fail fast if Invoke-Pester does not return a result object'
    );
    assert.ok(
      windowsJobBlock.includes(
        'throw "Windows Pester suite reported $($result.FailedCount) failure(s)."'
      ),
      'ci.yml should fail the Windows lane when the Pester result reports failures'
    );
    assert.ok(
      windowsJobBlock.includes('Get-Job -ErrorAction SilentlyContinue'),
      'ci.yml should inspect lingering PowerShell jobs in the same test shell before exiting the Windows lane'
    );
    assert.ok(
      windowsJobBlock.includes('Stop-Job -ErrorAction SilentlyContinue'),
      'ci.yml should stop lingering PowerShell jobs before exiting the Windows lane'
    );
    assert.ok(
      windowsJobBlock.includes('Remove-Job -Force -ErrorAction SilentlyContinue'),
      'ci.yml should remove lingering PowerShell jobs before exiting the Windows lane'
    );
    assert.ok(
      windowsJobBlock.includes('-Mode cleanup-conhost'),
      'ci.yml should invoke the Windows process helper in cleanup-conhost mode after diagnostics'
    );
    assert.ok(
      windowsJobBlock.includes(
        "TESTS_PASSED: ${{ steps.run-windows-unit-tests.outcome == 'success' && 'true' || 'false' }}"
      ),
      'ci.yml should derive the Windows lane outcome from a GitHub Actions expression so the output step stays shell-minimal'
    );
    assert.ok(
      windowsJobBlock.includes('"tests_passed=$env:TESTS_PASSED" >> $env:GITHUB_OUTPUT'),
      'ci.yml should emit the Windows lane outcome through a single redirected line to GITHUB_OUTPUT'
    );
    assert.ok(
      !windowsJobBlock.includes('Out-File -FilePath $env:GITHUB_OUTPUT'),
      'ci.yml should avoid the more error-prone multi-line Out-File pattern in the Windows lane outcome step'
    );
    assert.ok(
      ciWorkflow.includes('needs.test-windows.outputs.tests_passed'),
      'ci.yml should drive the CI summary gate from the recorded Windows lane output'
    );
    assert.ok(
      windowsProcessReporter.includes("ValidateSet('capture', 'report', 'cleanup-conhost')"),
      'the Windows process reporter should support snapshot capture, reporting, and targeted cleanup modes'
    );
    assert.ok(
      windowsProcessReporter.includes('Get-CimInstance Win32_Process'),
      'the Windows process reporter should inspect the live Win32 process table'
    );
    assert.ok(
      windowsProcessReporter.includes('Windows processes started after the job baseline:'),
      'the Windows process reporter should log new processes started during the job'
    );
    assert.ok(
      windowsProcessReporter.includes(
        'Windows shell and git processes still present before job completion:'
      ),
      'the Windows process reporter should log lingering shell and git processes before the runner cleanup phase'
    );
    assert.ok(
      windowsProcessReporter.includes('Windows lingering conhost cleanup candidates:'),
      'the Windows process reporter should log the lingering console-host cleanup candidates explicitly'
    );
    assert.ok(
      windowsProcessReporter.includes("[string]$_.Name -eq 'conhost.exe'"),
      'the Windows process reporter should scope active cleanup to lingering conhost.exe processes'
    );
    assert.ok(
      windowsProcessReporter.includes('Stop-Process -Id'),
      'the Windows process reporter should terminate lingering console hosts after they are identified'
    );
    assert.ok(
      windowsProcessReporter.includes('Terminated lingering Windows console host'),
      'the Windows process reporter should log each terminated lingering console host'
    );
    for (const relativePath of [
      'windows/tests/Windows.Browser.ChromiumPolicy.Tests.ps1',
      'windows/tests/Windows.Browser.Diagnostics.Tests.ps1',
      'windows/tests/Windows.Browser.FirefoxPolicy.Tests.ps1',
      'windows/tests/Windows.Browser.NativeHost.Tests.ps1',
    ]) {
      const browserTest = readText(relativePath);

      assert.ok(
        browserTest.includes('BeforeAll {'),
        `${relativePath} should continue to re-import its browser modules in BeforeAll`
      );
      assert.ok(
        browserTest.includes('Join-Path $PSScriptRoot ".." "lib"'),
        `${relativePath} should resolve browser module paths from PSScriptRoot inside the executable Pester scope`
      );
    }
  });

  test('release-please manifest is not behind the latest stable release tag', () => {
    const manifest = readJson('.release-please-manifest.json');
    const manifestVersion = String(manifest['.'] ?? '').trim();
    const latestStableTag = listStableReleaseTags()[0] ?? '';
    const latestStableVersion = latestStableTag.replace(/^v/, '');

    assert.ok(
      manifestVersion,
      '.release-please-manifest.json should define the root release version'
    );
    assert.ok(latestStableTag, 'repository should expose at least one stable v* tag');
    assert.ok(
      compareSemver(manifestVersion, latestStableVersion) >= 0,
      `release-please manifest (${manifestVersion}) is behind the latest stable tag (${latestStableTag})`
    );
  });

  test('verify:full overlaps coverage with unit tests and overlaps e2e with security', () => {
    const packageJson = readPackageJson();
    const verifyFull = packageJson.scripts['verify:full'];
    const verifyFullScript = readText('scripts/verify-full.sh');

    assert.equal(verifyFull, 'bash scripts/verify-full.sh');
    assert.ok(verifyFullScript.includes('npm run verify:static'));
    assert.ok(verifyFullScript.includes('npm run verify:checks'));
    assert.ok(
      verifyFullScript.includes(
        "concurrently --group --names 'coverage,unit' 'npm:verify:coverage' 'npm:verify:unit'"
      )
    );
    assert.ok(
      verifyFullScript.includes(
        "concurrently --group --names 'e2e,security' 'npm:e2e:full' 'npm:verify:security'"
      )
    );
  });

  test('lockfile keeps vite above the current high-severity advisory range', () => {
    const packageLock = readJson('package-lock.json');
    const viteVersion = packageLock.packages['node_modules/vite']?.version;

    assert.ok(viteVersion, 'package-lock.json should record the resolved vite version');
    assert.ok(
      compareSemver(viteVersion, '7.3.1') > 0,
      `vite ${viteVersion} is within the blocked advisory range ending at 7.3.1`
    );
  });

  test('pre-commit stays on the fast staged guard without re-running coverage', () => {
    const hook = readFileSync(resolve(projectRoot, '.husky/pre-commit'), 'utf8');

    assert.ok(
      hook.includes('[2/2] Running staged verification...'),
      'pre-commit should keep the staged verification step as its final fast guard'
    );
    assert.ok(
      !hook.includes('npm run verify:coverage'),
      'pre-commit should not run verify:coverage directly'
    );
    assert.ok(
      !hook.includes('check-test-files.sh'),
      'pre-commit should leave repo-wide test-file checks for pre-push'
    );
    assert.ok(!hook.includes('[3/3]'), 'pre-commit should keep the staged guard lean');
  });

  test('api Dockerfile uses dependency-only manifests and npm cache mounts', () => {
    const dockerfile = readFileSync(resolve(projectRoot, 'api/Dockerfile'), 'utf8');

    assert.ok(
      dockerfile.includes('# syntax=docker/dockerfile:1.7'),
      'api Dockerfile should opt into Dockerfile features required for cache mounts'
    );

    for (const manifestCase of DOCKER_MANIFEST_CASES) {
      const targetPath = manifestCase.packagePath.replace(/package\.json$/, 'package.json');
      assert.ok(
        dockerfile.includes(`COPY ${manifestCase.dockerPackagePath} ./${targetPath}`),
        `api Dockerfile should use ${manifestCase.dockerPackagePath} during npm ci`
      );
    }

    assert.ok(
      dockerfile.includes('--mount=type=cache,target=/root/.npm'),
      'api Dockerfile should cache npm downloads across repeated image builds'
    );
  });

  test('linux and windows clients do not reference the legacy classroom whitelist source', () => {
    const forbiddenFragments = ['LasEncinasIT', 'Whitelist-por-aula', 'Informatica%203.txt'];
    const clientRoots = ['linux', 'windows'];

    for (const root of clientRoots) {
      const files = walkTextFiles(root);

      for (const relativePath of files) {
        if (relativePath.includes('/node_modules/')) {
          continue;
        }

        if (
          relativePath.endsWith('.deb') ||
          relativePath.endsWith('.dll') ||
          relativePath.endsWith('.exe')
        ) {
          continue;
        }

        if (relativePath.includes('/dist/')) {
          continue;
        }

        if (relativePath.includes('/bin/')) {
          continue;
        }

        if (relativePath.includes('/obj/')) {
          continue;
        }

        const content = readText(relativePath);

        for (const forbidden of forbiddenFragments) {
          assert.ok(
            !content.includes(forbidden),
            `${relativePath} should not reference legacy classroom whitelist sources`
          );
        }
      }
    }
  });

  test('selenium CI scripts use cross-platform environment setup', () => {
    const seleniumPackage = readJson('tests/selenium/package.json');

    assert.equal(
      seleniumPackage.scripts['test:student-policy:ci'],
      'npx ts-node student-policy-flow.e2e.ts'
    );
    assert.equal(seleniumPackage.scripts['test:ci'], 'npx ts-node firefox-extension.e2e.ts');
  });

  test('student policy selenium entrypoint keeps the local Firefox UUID helper boundary', () => {
    const studentPolicyScript = readText('tests/selenium/student-policy-flow.e2e.ts');

    assert.match(
      studentPolicyScript,
      /from '\.\/firefox-extension-uuid';/,
      'student-policy-flow.e2e.ts should import the Firefox UUID helper from the local selenium package'
    );
    assert.ok(
      !studentPolicyScript.includes('../e2e/student-flow/firefox-extension-uuid'),
      'student-policy-flow.e2e.ts should not import the Firefox UUID helper from tests/e2e'
    );
    assert.ok(
      existsSync(resolve(projectRoot, 'tests/selenium/firefox-extension-uuid.ts')),
      'tests/selenium/firefox-extension-uuid.ts should exist alongside the student policy entrypoint'
    );
    assert.ok(
      existsSync(resolve(projectRoot, 'tests/selenium/firefox-extension-uuid.test.ts')),
      'tests/selenium/firefox-extension-uuid.test.ts should cover the colocated helper'
    );
  });

  test('student policy runners provision selenium package dependencies before execution', () => {
    const windowsRunner = readText('tests/e2e/ci/run-windows-student-flow.ps1');
    const linuxStudentDockerfile = readText('tests/e2e/Dockerfile.student');

    assert.match(
      windowsRunner,
      /Push-Location \(Join-Path \$script:RepoRoot 'tests\\selenium'\)[\s\S]*npm install \| Out-Host/,
      'Windows student-policy runner should install tests/selenium dependencies before running the suite'
    );
    assert.match(
      linuxStudentDockerfile,
      /COPY tests\/selenium\/package\.json \.\/tests\/selenium\/package\.json[\s\S]*RUN cd \/openpath\/tests\/selenium && npm install/,
      'Linux student-policy image should copy the Selenium package manifests and install its dependencies'
    );
  });

  test('windows student policy runner packages the Firefox XPI with the canonical build script', () => {
    const windowsRunner = readText('tests/e2e/ci/run-windows-student-flow.ps1');

    assert.match(
      windowsRunner,
      /build-xpi\.sh/,
      'Windows student-policy runner should use firefox-extension/build-xpi.sh to create the Selenium XPI'
    );
    assert.ok(
      !windowsRunner.includes('Compress-Archive'),
      'Windows student-policy runner should not package the Selenium XPI with Compress-Archive'
    );
  });

  test('windows student policy runner enables Firefox unsigned addon support for Selenium', () => {
    const windowsRunner = readText('tests/e2e/ci/run-windows-student-flow.ps1');

    assert.match(
      windowsRunner,
      /xpinstall\.signatures\.required/,
      'Windows student-policy runner should disable Firefox addon signature enforcement for the Selenium browser'
    );
    assert.match(
      windowsRunner,
      /extensions\.blocklist\.enabled/,
      'Windows student-policy runner should disable the Firefox extension blocklist for the Selenium browser'
    );
    assert.match(
      windowsRunner,
      /Write-Utf8NoBomLfFile -Path \$autoconfigPath/,
      'Windows student-policy runner should write Firefox autoconfig.js with the LF-only helper'
    );
  });

  test('windows student policy runner installs Firefox Nightly for unsigned Selenium addons', () => {
    const windowsRunner = readText('tests/e2e/ci/run-windows-student-flow.ps1');

    assert.match(
      windowsRunner,
      /choco install firefox-nightly/,
      'Windows student-policy runner should provision Firefox Nightly instead of Firefox Release'
    );
    assert.match(
      windowsRunner,
      /choco install firefox-nightly --pre --no-progress -y/,
      'Windows student-policy runner should install Firefox Nightly as a prerelease Chocolatey package'
    );
    assert.ok(
      !windowsRunner.includes('choco install firefox --no-progress -y'),
      'Windows student-policy runner should not provision Firefox Release for the unsigned Selenium addon flow'
    );
    assert.match(
      windowsRunner,
      /ProgramFiles\(x86\)/,
      'Windows student-policy runner should resolve Firefox Nightly across both 64-bit and 32-bit install roots'
    );
    assert.match(
      windowsRunner,
      /LOCALAPPDATA/,
      'Windows student-policy runner should also resolve Firefox Nightly from per-user install roots'
    );
    assert.match(
      windowsRunner,
      /OPENPATH_FIREFOX_BINARY/,
      'Windows student-policy runner should honor an explicit Firefox binary override when provided'
    );
    assert.match(
      windowsRunner,
      /Test-Path \$overridePath -PathType Leaf/,
      'Windows student-policy runner should require OPENPATH_FIREFOX_BINARY to point to a Firefox executable file'
    );
    assert.match(
      windowsRunner,
      /GetFileName\(\$overridePath\) -ieq 'firefox\.exe'/,
      'Windows student-policy runner should validate that OPENPATH_FIREFOX_BINARY targets firefox.exe'
    );
  });

  test('student policy selenium driver supports overriding the Firefox binary path', () => {
    const studentPolicyScript = readText('tests/selenium/student-policy-flow.e2e.ts');

    assert.match(
      studentPolicyScript,
      /firefoxBinaryPath\?: string;/,
      'StudentPolicyDriverOptions should expose a Firefox binary override'
    );
    assert.match(
      studentPolicyScript,
      /OPENPATH_FIREFOX_BINARY/,
      'student-policy-flow.e2e.ts should read the Firefox binary override from OPENPATH_FIREFOX_BINARY'
    );
    assert.match(
      studentPolicyScript,
      /options\.setBinary\(this\.firefoxBinaryPath\)/,
      'student-policy-flow.e2e.ts should pass the configured Firefox binary path into selenium-webdriver'
    );
  });

  test('windows student policy runner restores Firefox unsigned addon support changes during cleanup', () => {
    const windowsRunner = readText('tests/e2e/ci/run-windows-student-flow.ps1');

    assert.match(
      windowsRunner,
      /function Restore-FirefoxUnsignedAddonSupport/,
      'Windows student-policy runner should define a cleanup routine for Firefox unsigned addon support'
    );
    assert.match(
      windowsRunner,
      /finally\s*\{[\s\S]*?Restore-FirefoxUnsignedAddonSupport/,
      'Windows student-policy runner should invoke the Firefox unsigned addon cleanup routine'
    );
  });

  test('windows student policy runner preserves caller Firefox overrides across Selenium phases', () => {
    const windowsRunner = readText('tests/e2e/ci/run-windows-student-flow.ps1');

    assert.match(
      windowsRunner,
      /\$originalFirefoxBinary = \$env:OPENPATH_FIREFOX_BINARY/,
      'Windows student-policy runner should snapshot any caller-provided Firefox binary override before running Selenium'
    );
    assert.match(
      windowsRunner,
      /if \(\$null -ne \$originalFirefoxBinary\) \{[\s\S]*?\$env:OPENPATH_FIREFOX_BINARY = \$originalFirefoxBinary[\s\S]*?\}\s*else \{[\s\S]*?Remove-Item Env:\\OPENPATH_FIREFOX_BINARY/s,
      'Windows student-policy runner should restore the caller Firefox binary override after each Selenium phase'
    );
  });

  test('windows student policy runner resolves the Firefox binary once before changing directories', () => {
    const windowsRunner = readText('tests/e2e/ci/run-windows-student-flow.ps1');

    assert.match(
      windowsRunner,
      /\$script:FirefoxBinaryPath = \$null/,
      'Windows student-policy runner should cache the resolved Firefox binary path across phases'
    );
    assert.match(
      windowsRunner,
      /if \(\$script:FirefoxBinaryPath\) \{\s*return \$script:FirefoxBinaryPath\s*\}/,
      'Windows student-policy runner should reuse the cached Firefox binary path instead of re-resolving it after Push-Location'
    );
  });

  test('windows student policy runner isolates Firefox config restore failures per file', () => {
    const windowsRunner = readText('tests/e2e/ci/run-windows-student-flow.ps1');

    assert.match(
      windowsRunner,
      /try \{\s*Restore-FirefoxConfigFile -Snapshot \$script:FirefoxUnsignedAddonSupportState\.Autoconfig[\s\S]*?catch \{/,
      'Windows student-policy runner should isolate autoconfig restore failures so later cleanup still runs'
    );
    assert.match(
      windowsRunner,
      /try \{\s*Restore-FirefoxConfigFile -Snapshot \$script:FirefoxUnsignedAddonSupportState\.MozillaCfg[\s\S]*?catch \{/,
      'Windows student-policy runner should isolate mozilla.cfg restore failures so both files are attempted'
    );
  });

  test('windows student policy runner preserves the primary test failure when cleanup also fails', () => {
    const windowsRunner = readText('tests/e2e/ci/run-windows-student-flow.ps1');

    assert.match(
      windowsRunner,
      /\$script:PrimaryFailure = \$null/,
      'Windows student-policy runner should track the primary failure separately from cleanup failures'
    );
    assert.match(
      windowsRunner,
      /\$script:PrimaryFailure = \$_/,
      'Windows student-policy runner should capture the primary failure in the catch block'
    );
    assert.match(
      windowsRunner,
      /if \(\(\$null -ne \$cleanupError\) -and \(\$null -eq \$script:PrimaryFailure\)\) \{[\s\S]*?throw \$cleanupError/s,
      'Windows student-policy runner should only surface cleanup errors when there is no earlier test failure to preserve'
    );
  });

  test('windows student policy runner only reports success after cleanup completes', () => {
    const windowsRunner = readText('tests/e2e/ci/run-windows-student-flow.ps1');

    assert.match(
      windowsRunner,
      /\$script:RunSucceeded = \$false/,
      'Windows student-policy runner should track whether the main execution path reached success before cleanup'
    );
    assert.match(
      windowsRunner,
      /finally\s*\{[\s\S]*?if \(\(\$script:RunSucceeded\) -and \(\$null -eq \$cleanupError\) -and \(\$null -eq \$script:PrimaryFailure\)\) \{[\s\S]*?Publish-GitHubStepSummary -Mode 'success'[\s\S]*?Windows student-policy runner completed successfully/s,
      'Windows student-policy runner should publish success only after cleanup succeeds'
    );
  });

  test('windows DNS renderer avoids wildcard FW rules that override blocked descendants', () => {
    const dnsModule = readText('windows/lib/DNS.psm1');

    assert.match(
      dnsModule,
      /function Get-AcrylicForwardRules/,
      'windows/lib/DNS.psm1 should keep Acrylic wildcard forward generation in a dedicated helper'
    );
    assert.match(
      dnsModule,
      /Get-AcrylicForwardRules -Domain \$domain -BlockedSubdomains \$BlockedSubdomains/,
      'New-AcrylicHostsDefinition should pass blocked subdomains into wildcard forward generation'
    );
    assert.match(
      dnsModule,
      /\[string\[\]\]\$BlockedSubdomains = @\(\)/,
      'Get-AcrylicForwardRules should accept the blocked subdomain list'
    );
    assert.match(
      dnsModule,
      /FW >\$normalizedDomain/,
      'Get-AcrylicForwardRules should still emit FW >domain when no blocked descendants exist'
    );
    assert.match(
      dnsModule,
      /\$escapedBlockedPattern = \(\$blockedDescendants -join '\\|'\)/,
      'Get-AcrylicForwardRules should combine blocked descendants into a single negative-lookahead pattern'
    );
    assert.match(
      dnsModule,
      /\$escapedDomain = \[regex\]::Escape\(\$normalizedDomain\)/,
      'Get-AcrylicForwardRules should escape the forwarded parent domain before building the regex rule'
    );
    assert.match(
      dnsModule,
      /\"FW \/\^\(\?!.*\$escapedBlockedPattern.*\$escapedDomain\$\"/,
      'Get-AcrylicForwardRules should emit a regex-based FW rule that excludes blocked descendants when needed'
    );
    assert.ok(
      !dnsModule.includes('"FW /^(?!(?:.*\\.)?(?:$escapedBlockedPattern)$).*\\.$escapedDomain$/"'),
      'Get-AcrylicForwardRules should not emit a trailing slash in Acrylic regex rules'
    );
    assert.match(
      dnsModule,
      /if \(\$blockedDescendants\.Count -eq 0\) \{[\s\S]*?"FW >\$normalizedDomain"[\s\S]*?\}/,
      'Get-AcrylicForwardRules should keep the wildcard FW shortcut only for domains without blocked descendants'
    );
  });

  test('windows DNS renderer keeps essential domains on unconditional wildcard forwarding', () => {
    const dnsModule = readText('windows/lib/DNS.psm1');

    assert.match(
      dnsModule,
      /\$essentialLines \+= @\(Get-AcrylicForwardRules -Domain \$domain\)/,
      'Essential control-plane domains should keep unconditional wildcard FW rules'
    );
    assert.ok(
      !dnsModule.includes(
        '$essentialLines += @(Get-AcrylicForwardRules -Domain $domain -BlockedSubdomains $BlockedSubdomains)'
      ),
      'Essential control-plane domains should not inherit classroom blocked-subdomain overrides'
    );
  });

  test('root tooling can resolve drizzle-orm for hoisted drizzle-kit commands', () => {
    const packageJson = readPackageJson();
    const packageLock = readJson('package-lock.json');
    const apiPackageJson = readJson('api/package.json');

    assert.equal(
      packageJson.devDependencies?.['drizzle-orm'],
      apiPackageJson.dependencies['drizzle-orm'],
      'root devDependencies should pin drizzle-orm to the api workspace version for hoisted tooling'
    );
    assert.ok(
      packageLock.packages['node_modules/drizzle-orm'],
      'package-lock.json should install drizzle-orm at the workspace root for hoisted drizzle-kit resolution'
    );
  });
});
