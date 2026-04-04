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
});
