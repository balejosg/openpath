#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { prepareFirefoxReleaseArtifacts } from './build-firefox-release.mjs';

const __filename = fileURLToPath(import.meta.url);
const extensionRoot = path.dirname(__filename);
const defaultArtifactsDir = path.join(extensionRoot, 'build', 'firefox-release-signing');
const firefoxReleaseSourceEntries = ['manifest.json', 'dist', 'popup', 'blocked', 'icons'];
const defaultWebExtSignMaxRetries = 2;
const defaultWebExtSignRetryBufferSeconds = 10;
const defaultWebExtSignMaxThrottleWaitSeconds = 900;

function fail(message) {
  throw new Error(message);
}

export function buildWebExtSignArgs(options) {
  const { apiKey, apiSecret, artifactsDir, sourceDir = extensionRoot } = options;

  if (!apiKey) {
    fail('WEB_EXT_API_KEY is required');
  }
  if (!apiSecret) {
    fail('WEB_EXT_API_SECRET is required');
  }

  return [
    '--yes',
    'web-ext',
    'sign',
    '--channel=unlisted',
    `--source-dir=${sourceDir}`,
    `--artifacts-dir=${artifactsDir}`,
    `--api-key=${apiKey}`,
    `--api-secret=${apiSecret}`,
  ];
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function parseWebExtThrottleDelaySeconds(output) {
  const match = /Expected available in\s+(\d+)\s+seconds?/i.exec(output);
  return match ? Number.parseInt(match[1], 10) : null;
}

function sleepSync(milliseconds) {
  if (milliseconds <= 0) {
    return;
  }

  const waitBuffer = new SharedArrayBuffer(4);
  const waitArray = new Int32Array(waitBuffer);
  Atomics.wait(waitArray, 0, 0, milliseconds);
}

export function runWebExtSignWithRetry(options) {
  const {
    args,
    cwd,
    env = process.env,
    spawnSyncImpl = spawnSync,
    sleepSyncImpl = sleepSync,
    stdout = process.stdout,
    stderr = process.stderr,
  } = options;
  const maxRetries = parseNonNegativeInteger(
    env.WEB_EXT_SIGN_MAX_RETRIES,
    defaultWebExtSignMaxRetries
  );
  const retryBufferSeconds = parseNonNegativeInteger(
    env.WEB_EXT_SIGN_RETRY_BUFFER_SECONDS,
    defaultWebExtSignRetryBufferSeconds
  );
  const maxThrottleWaitSeconds = parseNonNegativeInteger(
    env.WEB_EXT_SIGN_MAX_THROTTLE_WAIT_SECONDS,
    defaultWebExtSignMaxThrottleWaitSeconds
  );

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const result = spawnSyncImpl('npx', args, {
      cwd,
      encoding: 'utf8',
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

    if (result.stdout) {
      stdout.write(result.stdout);
    }
    if (result.stderr) {
      stderr.write(result.stderr);
    }

    if (result.status === 0) {
      return result;
    }

    const throttleDelaySeconds = parseWebExtThrottleDelaySeconds(output);
    const retriesRemaining = attempt < maxRetries;
    const canWait = throttleDelaySeconds !== null && throttleDelaySeconds <= maxThrottleWaitSeconds;

    if (!retriesRemaining || !canWait) {
      return result;
    }

    const waitSeconds = throttleDelaySeconds + retryBufferSeconds;
    console.warn(
      `[sign:firefox-release] AMO signing request was throttled; retrying in ${waitSeconds} seconds`
    );
    sleepSyncImpl(waitSeconds * 1000);
  }

  return { status: 1 };
}

export function findSignedXpiArtifact(artifactsDir) {
  const resolvedDir = path.resolve(artifactsDir);
  if (!fs.existsSync(resolvedDir)) {
    fail(`web-ext artifacts directory not found: ${resolvedDir}`);
  }

  const xpiFiles = fs
    .readdirSync(resolvedDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.xpi'))
    .map((entry) => path.join(resolvedDir, entry.name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  if (xpiFiles.length === 0) {
    fail(`web-ext did not produce a signed XPI in ${resolvedDir}`);
  }

  return xpiFiles[0];
}

function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    fail(`manifest.json not found at ${manifestPath}`);
  }

  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function walkFiles(rootDir, relativeRoot = '') {
  const absoluteRoot = path.join(rootDir, relativeRoot);
  const entries = fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(
      relativeRoot.split(path.sep).join(path.posix.sep),
      entry.name
    );
    const absolutePath = path.join(rootDir, relativePath);

    if (entry.isDirectory()) {
      files.push(...walkFiles(rootDir, relativePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

function listFirefoxReleasePayloadFiles(sourceDir) {
  const resolvedSourceDir = path.resolve(sourceDir);
  const files = [];

  for (const entry of firefoxReleaseSourceEntries) {
    const absolutePath = path.join(resolvedSourceDir, entry);

    if (!fs.existsSync(absolutePath)) {
      fail(`Firefox release payload entry missing: ${entry}`);
    }

    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      files.push(...walkFiles(resolvedSourceDir, entry));
    } else if (stat.isFile()) {
      files.push(entry);
    } else {
      fail(`Firefox release payload entry is not a file or directory: ${entry}`);
    }
  }

  return files.sort();
}

export function computeFirefoxReleasePayloadHash(options = {}) {
  const { sourceDir = extensionRoot } = options;
  const resolvedSourceDir = path.resolve(sourceDir);
  const hash = createHash('sha256');

  for (const relativePath of listFirefoxReleasePayloadFiles(resolvedSourceDir)) {
    const normalizedPath = relativePath.split(path.sep).join(path.posix.sep);
    hash.update('file\0');
    hash.update(normalizedPath);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(resolvedSourceDir, relativePath)));
    hash.update('\0');
  }

  return hash.digest('hex');
}

function prepareFirefoxReleaseSourceDir(sourceDir) {
  const resolvedSourceDir = path.resolve(sourceDir);
  const tempSourceDir = fs.mkdtempSync(path.join(tmpdir(), 'openpath-firefox-sign-'));

  try {
    for (const entry of firefoxReleaseSourceEntries) {
      const sourcePath = path.join(resolvedSourceDir, entry);
      if (!fs.existsSync(sourcePath)) {
        fail(`Firefox release payload entry missing: ${entry}`);
      }

      fs.cpSync(sourcePath, path.join(tempSourceDir, entry), { recursive: true });
    }
  } catch (error) {
    fs.rmSync(tempSourceDir, { recursive: true, force: true });
    throw error;
  }

  return tempSourceDir;
}

export function prepareSigningSourceDir(options) {
  const { sourceDir = extensionRoot, version = '' } = options;
  const resolvedSourceDir = path.resolve(sourceDir);
  const manifestPath = path.join(resolvedSourceDir, 'manifest.json');
  const manifest = readManifest(manifestPath);
  const baseVersion =
    typeof manifest.version === 'string' && manifest.version.trim().length > 0
      ? manifest.version.trim()
      : '';

  if (!baseVersion) {
    fail(`manifest.json at ${manifestPath} must define a non-empty version`);
  }

  const effectiveVersion = version.trim() || baseVersion;
  const tempSourceDir = prepareFirefoxReleaseSourceDir(resolvedSourceDir);

  manifest.version = effectiveVersion;
  fs.writeFileSync(
    path.join(tempSourceDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  return {
    sourceDir: tempSourceDir,
    effectiveVersion,
    cleanup() {
      fs.rmSync(tempSourceDir, { recursive: true, force: true });
    },
  };
}

function parseCliArgs(argv) {
  const parsed = {
    installUrl: '',
    artifactsDir: defaultArtifactsDir,
    version: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const next = argv[index + 1] ?? '';

    switch (arg) {
      case '--install-url':
        parsed.installUrl = next;
        index += 1;
        break;
      case '--artifacts-dir':
        parsed.artifactsDir = next;
        index += 1;
        break;
      case '--version':
        parsed.version = next;
        index += 1;
        break;
      case '--help':
      case '-h':
        console.log(`Usage:
  WEB_EXT_API_KEY=... WEB_EXT_API_SECRET=... node sign-firefox-release.mjs [--install-url https://...] [--version 2.0.0.123]

Options:
  --install-url   Optional managed install URL to store in metadata.json
  --artifacts-dir Override the temporary web-ext artifacts directory
  --version       Override manifest version for the signed release bundle
`);
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) {
          fail(`Unknown argument: ${arg}`);
        }
    }
  }

  return parsed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const { installUrl, artifactsDir, version } = parseCliArgs(process.argv.slice(2));
    const signingSource = prepareSigningSourceDir({
      sourceDir: extensionRoot,
      version,
    });

    try {
      const args = buildWebExtSignArgs({
        apiKey: process.env.WEB_EXT_API_KEY?.trim(),
        apiSecret: process.env.WEB_EXT_API_SECRET?.trim(),
        artifactsDir,
        sourceDir: signingSource.sourceDir,
      });

      const result = runWebExtSignWithRetry({
        args,
        cwd: extensionRoot,
      });

      if (result.status !== 0) {
        fail(`web-ext sign failed with status ${String(result.status ?? 'unknown')}`);
      }

      const signedXpiPath = findSignedXpiArtifact(artifactsDir);
      const prepared = prepareFirefoxReleaseArtifacts({
        extensionRoot,
        signedXpiPath,
        installUrl,
        version: signingSource.effectiveVersion,
      });

      console.log(
        `[sign:firefox-release] Signed Firefox Release bundle ready in ${path.relative(
          extensionRoot,
          prepared.outputDir
        )}`
      );
    } finally {
      signingSource.cleanup();
    }
  } catch (error) {
    console.error(
      `[sign:firefox-release] ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}
