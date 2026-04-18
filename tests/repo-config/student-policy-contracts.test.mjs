import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { projectRoot, readJson, readPackageJson, readText } from './support.mjs';

describe('repository verification contract', () => {
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

  test('student policy selenium sources stay compatible with their ts-node target', () => {
    const seleniumSources = [
      'tests/selenium/student-policy-client.ts',
      'tests/selenium/student-policy-driver-browser.ts',
      'tests/selenium/student-policy-driver-platform.ts',
      'tests/selenium/student-policy-driver-runtime.ts',
      'tests/selenium/student-policy-driver-state.ts',
      'tests/selenium/student-policy-driver.ts',
      'tests/selenium/student-policy-env.ts',
      'tests/selenium/student-policy-flow.e2e.ts',
      'tests/selenium/student-policy-harness.ts',
      'tests/selenium/student-policy-scenarios.ts',
      'tests/selenium/student-policy-types.ts',
    ];

    for (const sourcePath of seleniumSources) {
      assert.ok(
        !readText(sourcePath).includes('.at('),
        `${sourcePath} should not use Array.prototype.at because the CI ts-node package target does not expose it`
      );
    }
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

  test('windows student policy runner resolves installed Firefox before provisioning fallbacks', () => {
    const windowsRunner = readText('tests/e2e/ci/run-windows-student-flow.ps1');

    assert.match(
      windowsRunner,
      /function Get-FirefoxBinaryPath/,
      'Windows student-policy runner should resolve a usable Firefox binary through one helper'
    );
    assert.match(
      windowsRunner,
      /choco install firefox-nightly --pre --no-progress -y/,
      'Windows student-policy runner should still prefer Firefox Nightly when no Firefox binary exists'
    );
    assert.match(
      windowsRunner,
      /choco install firefox --no-progress -y/,
      'Windows student-policy runner should fall back to Firefox Release when Nightly provisioning is unavailable'
    );
    assert.match(
      windowsRunner,
      /Mozilla Firefox\\firefox\.exe/,
      'Windows student-policy runner should accept preinstalled Firefox Release on GitHub runners'
    );
    assert.match(
      windowsRunner,
      /ProgramFiles\(x86\)/,
      'Windows student-policy runner should resolve Firefox across both 64-bit and 32-bit install roots'
    );
    assert.match(
      windowsRunner,
      /LOCALAPPDATA/,
      'Windows student-policy runner should also resolve Firefox from per-user install roots'
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
    const studentPolicyDriver = readText('tests/selenium/student-policy-driver.ts');

    assert.match(
      studentPolicyDriver,
      /firefoxBinaryPath\?: string;/,
      'student-policy-driver.ts should expose a Firefox binary override'
    );
    assert.match(
      studentPolicyDriver,
      /OPENPATH_FIREFOX_BINARY/,
      'student-policy-driver.ts should read the Firefox binary override from OPENPATH_FIREFOX_BINARY'
    );
    assert.match(
      studentPolicyDriver,
      /options\.setBinary\(this\.firefoxBinaryPath\)/,
      'student-policy-driver.ts should pass the configured Firefox binary path into selenium-webdriver'
    );
  });

  test('student policy selenium driver disables Firefox DoH for DNS policy assertions', () => {
    const studentPolicyDriver = readText('tests/selenium/student-policy-driver.ts');

    assert.match(
      studentPolicyDriver,
      /options\.setPreference\('network\.trr\.mode', 5\)/,
      'student-policy-driver.ts should force Firefox to use native DNS so Selenium cannot bypass local dnsmasq policy'
    );
    assert.match(
      studentPolicyDriver,
      /options\.setPreference\('network\.trr\.uri', ''\)/,
      'student-policy-driver.ts should clear the Firefox TRR URI in Selenium profiles'
    );
    assert.match(
      studentPolicyDriver,
      /options\.setPreference\('network\.dnsCacheExpiration', 0\)/,
      'student-policy-driver.ts should disable Firefox DNS cache so policy changes converge in the same browser session'
    );
    assert.match(
      studentPolicyDriver,
      /options\.setPreference\('network\.dnsCacheExpirationGracePeriod', 0\)/,
      'student-policy-driver.ts should disable Firefox DNS cache grace period for policy-change tests'
    );
    assert.match(
      studentPolicyDriver,
      /pageLoad: DEFAULT_BLOCKED_TIMEOUT_MS/,
      'student-policy-driver.ts should bound page-load waits for sinkhole-blocked navigations'
    );
  });

  test('student policy Linux HTTP probes use bounded curl timeouts', () => {
    const platformDriver = readText('tests/selenium/student-policy-driver-platform.ts');

    assert.match(
      platformDriver,
      /curl -fsS --connect-timeout 3 --max-time 5/,
      'student-policy-driver-platform.ts should bound Linux curl probes so sinkhole routes cannot hang CI'
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

  test('windows student policy runner explicitly tears down OpenPath during cleanup', () => {
    const windowsRunner = readText('tests/e2e/ci/run-windows-student-flow.ps1');
    const cleanupBlock = windowsRunner.slice(windowsRunner.lastIndexOf('finally {'));

    assert.ok(
      existsSync(resolve(projectRoot, 'windows/Uninstall-OpenPath.ps1')),
      'windows/Uninstall-OpenPath.ps1 should exist for the Windows student-policy cleanup path'
    );
    assert.match(
      cleanupBlock,
      /& powershell\.exe -NoProfile -ExecutionPolicy Bypass -File \(Join-Path \$script:RepoRoot 'windows\\Uninstall-OpenPath\.ps1'\)/,
      'Windows student-policy runner should invoke windows/Uninstall-OpenPath.ps1 from the cleanup path'
    );
    assert.match(
      cleanupBlock,
      /if \(\$LASTEXITCODE -ne 0\) \{[\s\S]*?Uninstall-OpenPath\.ps1 failed with exit code \$LASTEXITCODE/s,
      'Windows student-policy runner should fail cleanup when Uninstall-OpenPath.ps1 exits non-zero'
    );
    assert.match(
      cleanupBlock,
      /try \{[\s\S]*?& powershell\.exe -NoProfile -ExecutionPolicy Bypass -File \(Join-Path \$script:RepoRoot 'windows\\Uninstall-OpenPath\.ps1'\)[\s\S]*?catch \{\s*\$cleanupError = \$_\s*\}/s,
      'Windows student-policy runner should isolate uninstall failures so later cleanup still runs'
    );
    assert.match(
      cleanupBlock,
      /try \{[\s\S]*?windows\\Uninstall-OpenPath\.ps1[\s\S]*?catch \{\s*\$cleanupError = \$_\s*\}[\s\S]*?try \{[\s\S]*?Restore-FirefoxUnsignedAddonSupport[\s\S]*?catch \{[\s\S]*?if \(\$null -eq \$cleanupError\)[\s\S]*?\$cleanupError = \$_[\s\S]*?\}[\s\S]*?try \{[\s\S]*?Stop-BackgroundJobs[\s\S]*?catch \{[\s\S]*?if \(\$null -eq \$cleanupError\)[\s\S]*?\$cleanupError = \$_[\s\S]*?\}[\s\S]*?try \{[\s\S]*?Cleanup-TestPostgres[\s\S]*?catch \{[\s\S]*?if \(\$null -eq \$cleanupError\)[\s\S]*?\$cleanupError = \$_/s,
      'Windows student-policy runner should isolate uninstall cleanup first, then continue Firefox, background job, and Postgres cleanup in order'
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
    const dnsConfigModule = readText('windows/lib/internal/DNS.Acrylic.Config.ps1');

    assert.match(
      dnsModule,
      /DNS\.Acrylic\.Config\.ps1/,
      'windows/lib/DNS.psm1 should load the internal Acrylic DNS config module'
    );
    assert.match(
      dnsConfigModule,
      /function Get-AcrylicForwardRules/,
      'windows/lib/internal/DNS.Acrylic.Config.ps1 should keep Acrylic wildcard forward generation in a dedicated helper'
    );
    assert.match(
      dnsConfigModule,
      /Get-AcrylicForwardRules -Domain \$domain -BlockedSubdomains \$BlockedSubdomains/,
      'New-AcrylicHostsDefinition should pass blocked subdomains into wildcard forward generation'
    );
    assert.match(
      dnsConfigModule,
      /\[string\[\]\]\$BlockedSubdomains = @\(\)/,
      'Get-AcrylicForwardRules should accept the blocked subdomain list'
    );
    assert.match(
      dnsConfigModule,
      /FW >\$normalizedDomain/,
      'Get-AcrylicForwardRules should still emit FW >domain when no blocked descendants exist'
    );
    assert.match(
      dnsConfigModule,
      /\$escapedBlockedPattern = \(\$blockedDescendants -join '\\|'\)/,
      'Get-AcrylicForwardRules should combine blocked descendants into a single negative-lookahead pattern'
    );
    assert.match(
      dnsConfigModule,
      /\$escapedDomain = \[regex\]::Escape\(\$normalizedDomain\)/,
      'Get-AcrylicForwardRules should escape the forwarded parent domain before building the regex rule'
    );
    assert.match(
      dnsConfigModule,
      /"FW \/\^\(\?!.*\$escapedBlockedPattern.*\$escapedDomain\$"/,
      'Get-AcrylicForwardRules should emit a regex-based FW rule that excludes blocked descendants when needed'
    );
    assert.ok(
      !dnsConfigModule.includes(
        '"FW /^(?!(?:.*\\.)?(?:$escapedBlockedPattern)$).*\\.$escapedDomain$/"'
      ),
      'Get-AcrylicForwardRules should not emit a trailing slash in Acrylic regex rules'
    );
    assert.match(
      dnsConfigModule,
      /if \(\$blockedDescendants\.Count -eq 0\) \{[\s\S]*?"FW >\$normalizedDomain"[\s\S]*?\}/,
      'Get-AcrylicForwardRules should keep the wildcard FW shortcut only for domains without blocked descendants'
    );
  });

  test('windows DNS renderer keeps essential domains on unconditional wildcard forwarding', () => {
    const dnsConfigModule = readText('windows/lib/internal/DNS.Acrylic.Config.ps1');

    assert.match(
      dnsConfigModule,
      /\$essentialLines \+= @\(Get-AcrylicForwardRules -Domain \$domain\)/,
      'Essential control-plane domains should keep unconditional wildcard FW rules'
    );
    assert.ok(
      !dnsConfigModule.includes(
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
