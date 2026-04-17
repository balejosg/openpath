import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { extractWorkflowJobBlock, projectRoot, readText } from './support.mjs';

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
});

test('prerelease deb publish keys off the CI Success summary job instead of the workflow conclusion', () => {
  const prereleaseWorkflow = readText('.github/workflows/prerelease-deb.yml');

  assert.ok(
    prereleaseWorkflow.includes('Inspect CI Success summary job'),
    'prerelease-deb.yml should inspect the CI Success summary job before building prerelease artifacts'
  );
  assert.ok(
    prereleaseWorkflow.includes('actions/runs/${{ github.event.workflow_run.id }}/jobs'),
    'prerelease-deb.yml should query the triggering CI workflow jobs so it can recover the canonical CI Success result'
  );
  assert.ok(
    prereleaseWorkflow.includes('select(.name == "CI Success")'),
    'prerelease-deb.yml should key prerelease publishing off the CI Success summary job'
  );
  assert.ok(
    prereleaseWorkflow.includes('ci_success_conclusion'),
    'prerelease-deb.yml should expose the recovered CI Success job conclusion as an output'
  );
  assert.ok(
    prereleaseWorkflow.includes("needs.ci-success.outputs.ci_success_conclusion == 'success'"),
    'prerelease-deb.yml should allow prerelease publishing when the CI Success summary job passed'
  );
  assert.ok(
    !prereleaseWorkflow.includes("github.event.workflow_run.conclusion == 'success'"),
    'prerelease-deb.yml should depend on the canonical CI Success summary rather than a broad workflow conclusion'
  );
});

test('Codecov coverage uploads stay wired to active workflows and the README badge targets the app UI', () => {
  const readme = readText('README.md');
  const reusableTestWorkflow = readText('.github/workflows/reusable-test.yml');

  assert.ok(
    existsSync(resolve(projectRoot, '.github/workflows/coverage.yml')),
    'the repository should keep an active coverage workflow instead of a badge-only Codecov setup'
  );

  const coverageWorkflow = readText('.github/workflows/coverage.yml');

  assert.ok(
    readme.includes(
      '[![codecov](https://codecov.io/github/balejosg/openpath/graph/badge.svg)](https://app.codecov.io/github/balejosg/openpath)'
    ),
    'README.md should point the Codecov badge at the current Codecov app URL and GitHub badge path'
  );
  assert.ok(
    coverageWorkflow.includes('uses: ./.github/workflows/reusable-test.yml'),
    'coverage.yml should invoke the reusable coverage test workflow'
  );

  for (const testType of ['api', 'web', 'spa', 'shared', 'extension']) {
    assert.ok(
      coverageWorkflow.includes(`test-type: ${testType}`),
      `coverage.yml should run the ${testType} coverage lane`
    );
  }

  assert.ok(
    reusableTestWorkflow.includes(
      "description: 'Coverage lane to run (api, web, spa, shared, extension)'"
    ),
    'reusable-test.yml should restrict the reusable coverage workflow to the active Codecov lanes only'
  );
  assert.ok(
    reusableTestWorkflow.includes('case "${{ inputs.test-type }}" in'),
    'reusable-test.yml should resolve lane-specific coverage configuration in one place'
  );
  assert.ok(
    reusableTestWorkflow.includes('run: ${{ steps.lane.outputs.test_command }}'),
    'reusable-test.yml should run coverage lanes from the resolved lane configuration instead of per-lane duplicated steps'
  );
  assert.ok(
    reusableTestWorkflow.includes('files: ${{ steps.lane.outputs.coverage_file }}'),
    'reusable-test.yml should upload the Codecov report selected by the resolved lane configuration'
  );
  assert.ok(
    reusableTestWorkflow.includes('flags: ${{ steps.lane.outputs.coverage_flag }}'),
    'reusable-test.yml should upload the Codecov flag selected by the resolved lane configuration'
  );
  assert.ok(
    reusableTestWorkflow.includes('path: ${{ steps.lane.outputs.coverage_dir }}'),
    'reusable-test.yml should upload only the coverage artifact directory for the active lane'
  );
  assert.ok(
    reusableTestWorkflow.includes("image: ${{ inputs.test-type == 'api' && 'postgres:16' || '' }}"),
    'reusable-test.yml should only provision PostgreSQL for the API coverage lane'
  );
  assert.ok(
    reusableTestWorkflow.includes("if: steps.lane.outputs.needs_postgres == 'true'"),
    'reusable-test.yml should gate database migrations on the resolved lane configuration'
  );
  assert.ok(
    reusableTestWorkflow.includes('npm run db:migrate --workspace=@openpath/api'),
    'reusable-test.yml should migrate PostgreSQL-backed coverage lanes with versioned migrations'
  );
  assert.ok(
    !reusableTestWorkflow.includes('npm run drizzle:push --workspace=@openpath/api'),
    'reusable-test.yml should not mix db:push with versioned migrations in the same coverage lane'
  );
  assert.ok(
    reusableTestWorkflow.includes('build-shared: ${{ steps.lane.outputs.build_shared }}'),
    'reusable-test.yml should derive shared build dependencies from the lane configuration'
  );
  assert.ok(
    reusableTestWorkflow.includes('build-api: ${{ steps.lane.outputs.build_api }}'),
    'reusable-test.yml should derive API build dependencies from the lane configuration'
  );
  assert.ok(
    reusableTestWorkflow.includes('build-extension: ${{ steps.lane.outputs.build_extension }}'),
    'reusable-test.yml should derive extension build dependencies from the lane configuration'
  );
  assert.ok(
    reusableTestWorkflow.includes(
      'test_command=npm run test:coverage --workspace=@openpath/react-spa'
    ),
    'reusable-test.yml should collect React SPA coverage before uploading to Codecov'
  );
  assert.ok(
    reusableTestWorkflow.includes('coverage_flag=dashboard'),
    'reusable-test.yml should map the dashboard lane to the dashboard Codecov flag'
  );
  assert.ok(
    reusableTestWorkflow.includes('coverage_flag=firefox-extension'),
    'reusable-test.yml should map the extension lane to the firefox-extension Codecov flag'
  );
  assert.ok(
    reusableTestWorkflow.includes('build_extension=true'),
    'reusable-test.yml should build the Firefox extension assets for the API coverage lane because token-delivery tests assert Windows manifest entries from firefox-extension/dist'
  );
  assert.ok(
    !reusableTestWorkflow.includes("inputs.test-type == 'integration'"),
    'reusable-test.yml should stop carrying the old integration lane branches in the coverage workflow'
  );
  assert.ok(
    !reusableTestWorkflow.includes("inputs.test-type == 'bash'"),
    'reusable-test.yml should stop carrying the old bash lane branches in the coverage workflow'
  );
  assert.ok(
    !reusableTestWorkflow.includes(
      "if: inputs.test-type == 'api'\n        run: npm run test:coverage --workspace=@openpath/api\n        env:\n          NODE_ENV: test\n          DB_HOST: localhost\n          DB_PORT: 5432\n          DB_NAME: openpath\n          DB_USER: openpath\n          DB_PASSWORD: openpath_dev\n          JWT_SECRET: test-jwt-secret-for-ci-testing"
    ),
    'reusable-test.yml should not override JWT_SECRET in the API coverage lane because auth.test verifies the test-mode fallback secret path'
  );

  const ciWorkflow = readText('.github/workflows/ci.yml');
  assert.ok(
    ciWorkflow.includes('npm run db:migrate --workspace=@openpath/api'),
    'ci.yml should bootstrap PostgreSQL-backed API checks with versioned migrations'
  );
  assert.ok(
    !ciWorkflow.includes('npm run drizzle:push --workspace=@openpath/api'),
    'ci.yml should not mix db:push with db:migrate in the same PostgreSQL setup flow'
  );
});

test('required Windows CI runs Pester in an untracked child host without success shortcuts', () => {
  const ciWorkflow = readText('.github/workflows/ci.yml');
  const linuxJobBlock = extractWorkflowJobBlock(ciWorkflow, 'test-linux-dnsmasq');
  const windowsJobBlock = extractWorkflowJobBlock(ciWorkflow, 'test-windows');
  const windowsProcessReporter = readText('tests/e2e/ci/report-windows-processes.ps1');
  const windowsPesterRunnerPath = 'tests/e2e/ci/run-windows-pester-isolated.ps1';

  assert.ok(
    existsSync(resolve(projectRoot, windowsPesterRunnerPath)),
    'the required Windows lane should use a committed isolated Pester runner helper'
  );

  const windowsPesterRunner = readText(windowsPesterRunnerPath);

  assert.ok(
    ciWorkflow.includes('linux_bound: ${{ steps.filter.outputs.linux_bound }}'),
    'ci.yml should publish a dedicated linux_bound output from Detect Relevant Changes'
  );
  assert.ok(
    ciWorkflow.includes('windows_bound: ${{ steps.filter.outputs.windows_bound }}'),
    'ci.yml should publish a dedicated windows_bound output from Detect Relevant Changes'
  );
  assert.ok(
    ciWorkflow.includes('echo "linux_bound=true" >> "$GITHUB_OUTPUT"'),
    'ci.yml should mark linux_bound true during workflow_dispatch runs'
  );
  assert.ok(
    ciWorkflow.includes('echo "windows_bound=true" >> "$GITHUB_OUTPUT"'),
    'ci.yml should mark windows_bound true during workflow_dispatch runs'
  );
  assert.ok(
    ciWorkflow.includes('linux_bound=false') && ciWorkflow.includes('windows_bound=false'),
    'ci.yml should initialize linux_bound and windows_bound independently'
  );
  assert.ok(
    ciWorkflow.includes("grep -Eq '^(linux/|tests/|\\.github/workflows/ci\\.yml$)'"),
    'ci.yml should route generic tests/ and linux/ changes to the Linux lane'
  );
  assert.ok(
    ciWorkflow.includes(
      "grep -Eq '^(windows/|tests/e2e/Windows-E2E\\.Tests\\.ps1|\\.github/workflows/ci\\.yml$)'"
    ),
    'ci.yml should only route Windows-specific paths to the Windows lane'
  );

  assert.ok(
    ciWorkflow.includes('runs-on: windows-2025'),
    'ci.yml should pin the required Windows Pester lane to windows-2025'
  );
  assert.ok(
    windowsJobBlock.includes('timeout-minutes: 15'),
    'ci.yml should cap the required Windows Pester lane so a genuine stuck runner does not block the workflow for hours'
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
    linuxJobBlock.includes("if: needs.detect-relevant-changes.outputs.linux_bound == 'true'"),
    'ci.yml should gate the Linux lane on the dedicated linux_bound output'
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
    windowsJobBlock.includes("if: needs.detect-relevant-changes.outputs.windows_bound == 'true'"),
    'ci.yml should gate the Windows lane on the dedicated windows_bound output'
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
    !windowsJobBlock.includes('name: Install Pester'),
    'ci.yml should not install Pester in the tracked Actions shell because PowerShellGet can leave runner-tracked Windows helpers behind'
  );
  assert.ok(
    windowsJobBlock.includes('tests/e2e/ci/run-windows-pester-isolated.ps1'),
    'ci.yml should run Windows Pester through the isolated helper'
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
    !ciWorkflow.includes('tests/e2e/ci/report-windows-processes.ps1') &&
      !ciWorkflow.includes('tests\\e2e\\ci\\report-windows-processes.ps1'),
    'ci.yml should keep live Windows process diagnostics out of the required Pester lane'
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
    !windowsJobBlock.includes('name: Report Windows process diagnostics'),
    'ci.yml should not re-run WMI process diagnostics immediately before runner orphan cleanup'
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
    'ci.yml should use pwsh only as the short-lived parent for the isolated Pester runner'
  );
  assert.ok(
    windowsPesterRunner.includes('Set-StrictMode -Off'),
    'the isolated Pester child should preserve the legacy non-strict Pester runtime used by the required Windows suite'
  );
  assert.ok(
    !windowsJobBlock.includes('report-windows-processes.ps1'),
    'ci.yml should not run live WMI process diagnostics in the required Windows lane because those diagnostics can keep the hosted runner in orphan cleanup'
  );
  assert.ok(
    windowsPesterRunner.includes('$aggregatorSuites = @('),
    'the isolated Pester runner should enumerate the Windows suite aggregators that must stay local-only'
  );
  assert.ok(
    windowsPesterRunner.includes("Get-ChildItem -Path 'windows/tests' -Filter '*.Tests.ps1' -File"),
    'the isolated Pester runner should discover the real Windows leaf suites from the suite directory'
  );
  assert.ok(
    windowsPesterRunner.includes('Where-Object { $_.Name -notin $aggregatorSuites }'),
    'the isolated Pester runner should exclude local-only Windows aggregator suites from the CI Pester path set'
  );
  assert.ok(
    windowsPesterRunner.includes('$config.Run.Path = $suitePaths'),
    'the isolated Pester runner should point at the discovered leaf suite paths instead of the whole directory'
  );
  assert.ok(
    windowsPesterRunner.includes(
      "throw 'Windows Pester suite discovery returned no leaf test files.'"
    ),
    'the isolated Pester runner should fail fast if Windows Pester suite discovery finds no executable leaf suites'
  );
  assert.ok(
    windowsPesterRunner.includes('$config.Run.PassThru = $true'),
    'the isolated Pester runner should request a Pester result object so FailedCount reflects the real suite outcome'
  );
  assert.ok(
    windowsPesterRunner.includes('$config.TestResult.OutputPath = $ResultsPath'),
    'the isolated Pester runner should keep the Windows lane writing its NUnit XML result file'
  );
  assert.ok(
    windowsPesterRunner.includes('Invoke-Pester -Configuration $config'),
    'the isolated Pester runner should continue to execute the real Pester suite'
  );
  assert.ok(
    windowsPesterRunner.includes(
      "throw 'Windows Pester suite did not produce windows-test-results.xml.'"
    ),
    'the isolated Pester runner should fail fast if the Windows lane does not emit its expected NUnit XML file'
  );
  assert.ok(
    windowsPesterRunner.includes("throw 'Invoke-Pester returned no result object.'"),
    'the isolated Pester runner should fail fast if Invoke-Pester does not return a result object'
  );
  assert.ok(
    windowsPesterRunner.includes(
      'throw "Windows Pester suite reported $($result.FailedCount) failure(s)."'
    ),
    'the isolated Pester runner should fail the Windows lane when the Pester result reports failures'
  );
  assert.ok(
    windowsPesterRunner.includes('Get-Job -ErrorAction SilentlyContinue'),
    'the isolated Pester runner should inspect lingering PowerShell jobs in the same test shell before exiting the Windows lane'
  );
  assert.ok(
    windowsPesterRunner.includes('Stop-Job -ErrorAction SilentlyContinue'),
    'the isolated Pester runner should stop lingering PowerShell jobs before exiting the Windows lane'
  );
  assert.ok(
    windowsPesterRunner.includes('Remove-Job -Force -ErrorAction SilentlyContinue'),
    'the isolated Pester runner should remove lingering PowerShell jobs before exiting the Windows lane'
  );
  assert.ok(
    windowsPesterRunner.includes("$null = $startInfo.Environment.Remove('RUNNER_TRACKING_ID')"),
    'the isolated Pester child should remove RUNNER_TRACKING_ID so Windows service helpers do not wedge Actions orphan cleanup'
  );
  assert.ok(
    windowsPesterRunner.includes('OPENPATH_WINDOWS_CI_ISOLATED_PESTER'),
    'the isolated Pester child should mark its execution mode for future diagnostics'
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
    !windowsJobBlock.includes('name: Hold successful Windows lane until timeout cancellation'),
    'ci.yml should not use a timeout-cancellation sentinel as the expected Windows success path'
  );
  assert.ok(
    !windowsJobBlock.includes('Start-Sleep -Seconds 3600'),
    'ci.yml should not intentionally sleep the Windows lane until timeout'
  );
  assert.ok(
    !windowsJobBlock.includes('name: Write Windows success marker'),
    'ci.yml should not require a Windows success-marker workaround for normal green CI'
  );
  assert.ok(
    !windowsJobBlock.includes('Set-Content -Path ci/windows-tests-passed.txt -Value success'),
    'ci.yml should not materialize a Windows success marker file in the workspace'
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
    ciWorkflow.includes('[[ "${{ needs.test-windows.result }}" == "success" ]] && \\'),
    'ci.yml should require a normal successful Windows job result before accepting the Windows lane output'
  );
  assert.ok(
    !ciWorkflow.includes('[[ "${{ needs.test-windows.result }}" == "cancelled" ]]'),
    'ci.yml should not treat a cancelled Windows lane as a successful CI outcome'
  );
  assert.ok(
    ciWorkflow.includes('CI Success is the canonical required signal for this workflow. Each lane'),
    'ci.yml should document in the summary job why CI Success is the canonical required signal'
  );
  assert.ok(
    !ciWorkflow.includes('workflow run may finish with a global cancelled conclusion'),
    'ci.yml should not document cancellation as an expected green path'
  );
  assert.ok(
    ciWorkflow.includes("- '.release-please-manifest.json'"),
    'ci.yml should trigger the canonical CI workflow when release-please metadata advances the stable version manifest'
  );
  assert.ok(
    ciWorkflow.includes("- 'release-please-config.json'"),
    'ci.yml should trigger the canonical CI workflow when release-please configuration changes'
  );
  assert.ok(
    !ciWorkflow.includes('name: Inspect Windows success marker'),
    'ci.yml should not query Windows marker-step metadata to recover a cancelled lane'
  );
  assert.ok(
    !ciWorkflow.includes('actions/upload-artifact@v7'),
    'ci.yml should avoid artifact uploads inside the Windows lane'
  );
  assert.ok(
    !ciWorkflow.includes('actions/download-artifact@v4'),
    'ci.yml should avoid artifact downloads in the summary job'
  );
  assert.ok(
    !ciWorkflow.includes('windows_success_marker_restored'),
    'ci.yml should not keep marker-restoration state for cancelled Windows lanes'
  );
  assert.ok(
    windowsProcessReporter.includes("ValidateSet('capture', 'report')"),
    'the Windows process reporter should remain available for manual investigation without being part of the required Windows lane'
  );
  assert.ok(
    windowsProcessReporter.includes('Get-CimInstance Win32_Process'),
    'the manual Windows process reporter should inspect the live Win32 process table when explicitly invoked'
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
