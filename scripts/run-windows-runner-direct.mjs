#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_PROXMOX_HOST = 'whitelist-proxmox';
const DEFAULT_WINDOWS_RUNNER_VMID = '103';
const DEFAULT_TIMEOUT_SECONDS = '900';
const DEFAULT_RESULTS_RELATIVE_PATH = 'windows-test-results.xml';
const DEFAULT_RESULTS_ARTIFACT_NAME = 'windows-test-results.xml';
const DEFAULT_ARTIFACT_LOG_NAME = 'windows-runner-direct.log';
const DEFAULT_RUNNER_ROOT_GLOB = 'C:\\actions-runner*';
const DRY_RUN = process.env.OPENPATH_WINDOWS_DIRECT_DRY_RUN === '1';

const currentFilePath = fileURLToPath(import.meta.url);
const scriptDir = dirname(currentFilePath);
const projectRoot = resolve(scriptDir, '..');

function printUsage() {
  console.error(`Usage:
  npm run diagnostics:windows:direct -- [options]

Options:
  --proxmox-host <host>       Proxmox SSH host/alias (default: ${DEFAULT_PROXMOX_HOST})
  --vmid <id>                 Windows runner VMID (default: ${DEFAULT_WINDOWS_RUNNER_VMID})
  --timeout-seconds <secs>    Timeout passed to the isolated Pester helper (default: ${DEFAULT_TIMEOUT_SECONDS})
  --results-path <path>       Result file path on the Windows runner relative to the repo root (default: ${DEFAULT_RESULTS_RELATIVE_PATH})
  --runner-repo-root <path>   Explicit OpenPath checkout root on the Windows runner (default: auto-detect under ${DEFAULT_RUNNER_ROOT_GLOB})
  --artifact-dir <path>       Local artifact directory (default: .opencode/tmp/openpath-windows-direct/<timestamp>)
  --help                      Show this message
`);
}

function parseArgs(argv) {
  const options = {
    proxmoxHost:
      process.env.WINDOWS_RUNNER_PROXMOX_HOST ??
      process.env.PROXMOX_SSH_ALIAS ??
      DEFAULT_PROXMOX_HOST,
    vmid: process.env.WINDOWS_RUNNER_VMID ?? DEFAULT_WINDOWS_RUNNER_VMID,
    timeoutSeconds: process.env.OPENPATH_WINDOWS_DIRECT_TIMEOUT_SECONDS ?? DEFAULT_TIMEOUT_SECONDS,
    resultsPath: process.env.OPENPATH_WINDOWS_DIRECT_RESULTS_PATH ?? DEFAULT_RESULTS_RELATIVE_PATH,
    runnerRepoRoot: process.env.OPENPATH_WINDOWS_DIRECT_RUNNER_REPO_ROOT ?? '',
    artifactDir: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    if (arg === '--proxmox-host') {
      options.proxmoxHost = next();
    } else if (arg === '--vmid') {
      options.vmid = next();
    } else if (arg === '--timeout-seconds') {
      options.timeoutSeconds = next();
    } else if (arg === '--results-path') {
      options.resultsPath = next();
    } else if (arg === '--runner-repo-root') {
      options.runnerRepoRoot = next();
    } else if (arg === '--artifact-dir') {
      options.artifactDir = resolve(projectRoot, next());
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function shellQuote(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:@=+-]+$/.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`;
}

function renderCommand(args) {
  return args.map((arg) => shellQuote(arg)).join(' ');
}

function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function runCommand(args, { cwd = projectRoot, input, capture = false } = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd,
    encoding: 'utf8',
    input,
    stdio: capture ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit'],
  });

  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : '';
    throw new Error(
      `${renderCommand(args)} failed with exit code ${result.status ?? 'unknown'}${stderr}`
    );
  }

  return capture ? result.stdout.trim() : '';
}

function runGuestCommand(options, guestArgs, { capture = true } = {}) {
  const remoteCommand = renderCommand(['qm', 'guest', 'exec', options.vmid, ...guestArgs]);
  const args = ['ssh', options.proxmoxHost, remoteCommand];

  if (DRY_RUN) {
    const encodedCommandIndex = guestArgs.indexOf('-EncodedCommand');
    const previewGuestArgs =
      encodedCommandIndex === -1
        ? guestArgs
        : [...guestArgs.slice(0, encodedCommandIndex + 1), '<encoded>'];
    console.log(
      renderCommand([
        'ssh',
        options.proxmoxHost,
        renderCommand(['qm', 'guest', 'exec', options.vmid, ...previewGuestArgs]),
      ])
    );
    return '';
  }

  const output = runCommand(args, { capture });
  if (!capture) {
    return '';
  }

  const payload = JSON.parse(output);
  if (payload.exitcode !== 0 || payload.exited !== 1) {
    throw new Error(
      `Guest command failed with exit code ${payload.exitcode ?? 'unknown'}: ${payload['err-data'] ?? payload['out-data'] ?? ''}`
    );
  }

  return payload['out-data'] ?? '';
}

function runGuestPowerShell(options, script, { timeoutSeconds = 600 } = {}) {
  return runGuestCommand(options, [
    '--timeout',
    String(timeoutSeconds),
    '--',
    'powershell.exe',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    encodePowerShell(script),
  ]);
}

function buildRunnerRepoRootScript() {
  return String.raw`
$candidateRoots = @()
if (${JSON.stringify(DEFAULT_RUNNER_ROOT_GLOB)}) {
  $candidateRoots += Get-ChildItem -Path ${JSON.stringify(DEFAULT_RUNNER_ROOT_GLOB)} -Directory -Force -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName '_work' }
}

$candidateRoots += 'C:\\actions-runner\\_work'

$repoRoots = $candidateRoots |
  Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
  ForEach-Object {
    Get-ChildItem -Path $_ -Directory -Force -ErrorAction SilentlyContinue |
      ForEach-Object { Join-Path $_.FullName $_.Name }
  }

$repoRoots = @(
  $repoRoots |
  Where-Object {
    Test-Path -LiteralPath (Join-Path $_ 'tests\\e2e\\ci\\run-windows-pester-isolated.ps1')
  } |
  Sort-Object -Unique
)

ConvertTo-Json -InputObject $repoRoots -Compress
`;
}

function parseRunnerRepoRootCandidates(output) {
  const trimmed = output.trim();
  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function getRunnerRepoRootPriority(repoRoot) {
  if (/^C:\\actions-runner-openpath\\/i.test(repoRoot)) {
    return 0;
  }

  if (/^C:\\actions-runner\\/i.test(repoRoot)) {
    return 1;
  }

  return 2;
}

function selectPreferredRunnerRepoRoot(candidateRepoRoots) {
  const repoRoots = [
    ...new Set(candidateRepoRoots.map((value) => String(value).trim()).filter(Boolean)),
  ];

  if (repoRoots.length === 0) {
    throw new Error('Unable to auto-detect the OpenPath checkout root on the Windows runner.');
  }

  repoRoots.sort((left, right) => {
    const priorityDifference = getRunnerRepoRootPriority(left) - getRunnerRepoRootPriority(right);
    return priorityDifference !== 0 ? priorityDifference : left.localeCompare(right);
  });

  return repoRoots[0];
}

function resolveWindowsRunnerRepoRoot(options) {
  if (options.runnerRepoRoot) {
    return options.runnerRepoRoot;
  }

  const candidateRepoRoots = parseRunnerRepoRootCandidates(
    runGuestPowerShell(options, buildRunnerRepoRootScript(), {
      timeoutSeconds: 120,
    })
  );

  return selectPreferredRunnerRepoRoot(candidateRepoRoots);
}

function ensureWindowsRunnerBaseline(options, runnerRepoRoot) {
  const script = `
$ErrorActionPreference = 'Stop'
hostname
whoami
$pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
if (-not $pwsh) {
  throw 'pwsh is required on the Windows runner.'
}
if (-not (Test-Path ${JSON.stringify(runnerRepoRoot)})) {
  throw 'Expected OpenPath checkout root is missing on the Windows runner.'
}
`;
  runGuestPowerShell(options, script, { timeoutSeconds: 120 });
}

function resetWindowsRunner(options, runnerRepoRoot) {
  const resetScriptPath = `${runnerRepoRoot}\\tests\\e2e\\ci\\reset-self-hosted-windows-runner.ps1`;
  const script = `
$ErrorActionPreference = 'Stop'
if (-not (Test-Path ${JSON.stringify(resetScriptPath)})) {
  throw 'reset-self-hosted-windows-runner.ps1 is missing on the Windows runner checkout.'
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${JSON.stringify(resetScriptPath)}
if ($LASTEXITCODE -ne 0) {
  throw "reset-self-hosted-windows-runner.ps1 exited with code $LASTEXITCODE"
}
`;
  runGuestPowerShell(options, script, { timeoutSeconds: 300 });
}

function runDirectPester(options, runnerRepoRoot) {
  const isolatedRunnerPath = `${runnerRepoRoot}\\tests\\e2e\\ci\\run-windows-pester-isolated.ps1`;
  const repoRoot = runnerRepoRoot;
  const resultsPath = options.resultsPath.replace(/\//g, '\\\\');
  const script = `
$ErrorActionPreference = 'Stop'
$repoRoot = ${JSON.stringify(repoRoot)}
$runnerPath = ${JSON.stringify(isolatedRunnerPath)}
$resultsPath = ${JSON.stringify(resultsPath)}

if (-not (Test-Path $runnerPath)) {
  throw 'run-windows-pester-isolated.ps1 is missing on the Windows runner checkout.'
}

Set-Location $repoRoot
& pwsh -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runnerPath -RepoRoot $repoRoot -ResultsPath $resultsPath -TimeoutSeconds ${Number.parseInt(options.timeoutSeconds, 10)}
if ($LASTEXITCODE -ne 0) {
  throw "run-windows-pester-isolated.ps1 exited with code $LASTEXITCODE"
}
`;
  runGuestPowerShell(options, script, {
    timeoutSeconds: Number.parseInt(options.timeoutSeconds, 10) + 120,
  });
}

function readGuestFile(options, sourcePath, maxChars = 500000) {
  const script = `
$ErrorActionPreference = 'Stop'
$path = ${JSON.stringify(sourcePath)}
if (-not (Test-Path -LiteralPath $path)) { exit 0 }
$content = Get-Content -LiteralPath $path -Raw
if ($content.Length -gt ${maxChars}) {
  $content.Substring($content.Length - ${maxChars})
} else {
  $content
}
`;
  return runGuestPowerShell(options, script, { timeoutSeconds: 120 });
}

function collectArtifacts(options, artifactDir, runnerRoot) {
  const resultsContent = readGuestFile(
    options,
    `${runnerRoot}\\${options.resultsPath.replace(/\//g, '\\')}`
  );
  if (resultsContent.trim()) {
    writeFileSync(resolve(artifactDir, DEFAULT_RESULTS_ARTIFACT_NAME), resultsContent, 'utf8');
  }

  const runnerLog = readGuestFile(
    options,
    `${runnerRoot}\\tests\\e2e\\artifacts\\windows-student-policy\\windows-student-policy-trace.log`,
    120000
  );
  if (runnerLog.trim()) {
    writeFileSync(resolve(artifactDir, DEFAULT_ARTIFACT_LOG_NAME), runnerLog, 'utf8');
  }
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printUsage();
    process.exit(1);
  }

  const artifactDir =
    options.artifactDir ||
    resolve(
      projectRoot,
      '.opencode/tmp/openpath-windows-direct',
      new Date().toISOString().replace(/[:.]/g, '-')
    );

  console.log(`artifact_dir=${artifactDir}`);
  console.log(
    `proxmox_guest_agent=ssh ${options.proxmoxHost} qm guest exec ${options.vmid} -- powershell.exe`
  );
  console.log(`runner_repo_root=${options.runnerRepoRoot || '<auto-detect-on-runner>'}`);

  if (!DRY_RUN) {
    mkdirSync(artifactDir, { recursive: true });
  }

  const runnerRepoRoot = DRY_RUN
    ? options.runnerRepoRoot || ''
    : resolveWindowsRunnerRepoRoot(options);

  ensureWindowsRunnerBaseline(options, runnerRepoRoot || options.runnerRepoRoot);
  resetWindowsRunner(options, runnerRepoRoot || options.runnerRepoRoot);
  runDirectPester(options, runnerRepoRoot || options.runnerRepoRoot);

  if (!DRY_RUN) {
    collectArtifacts(options, artifactDir, runnerRepoRoot);
  }

  console.log(`direct OpenPath Windows runner diagnostic complete: ${artifactDir}`);
}

const isDirectExecution = process.argv[1] ? resolve(process.argv[1]) === currentFilePath : false;

if (isDirectExecution) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export { parseRunnerRepoRootCandidates, selectPreferredRunnerRepoRoot };
