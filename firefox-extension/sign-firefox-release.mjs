#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareFirefoxReleaseArtifacts } from './build-firefox-release.mjs';

const __filename = fileURLToPath(import.meta.url);
const extensionRoot = path.dirname(__filename);
const defaultArtifactsDir = path.join(extensionRoot, 'build', 'firefox-release-signing');

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

function parseCliArgs(argv) {
  const parsed = {
    installUrl: '',
    artifactsDir: defaultArtifactsDir,
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
      case '--help':
      case '-h':
        console.log(`Usage:
  WEB_EXT_API_KEY=... WEB_EXT_API_SECRET=... node sign-firefox-release.mjs [--install-url https://...]

Options:
  --install-url   Optional managed install URL to store in metadata.json
  --artifacts-dir Override the temporary web-ext artifacts directory
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
    const { installUrl, artifactsDir } = parseCliArgs(process.argv.slice(2));
    const args = buildWebExtSignArgs({
      apiKey: process.env.WEB_EXT_API_KEY?.trim(),
      apiSecret: process.env.WEB_EXT_API_SECRET?.trim(),
      artifactsDir,
      sourceDir: extensionRoot,
    });

    const result = spawnSync('npx', args, {
      cwd: extensionRoot,
      encoding: 'utf8',
      stdio: 'inherit',
    });

    if (result.status !== 0) {
      fail(`web-ext sign failed with status ${String(result.status ?? 'unknown')}`);
    }

    const signedXpiPath = findSignedXpiArtifact(artifactsDir);
    const prepared = prepareFirefoxReleaseArtifacts({
      extensionRoot,
      signedXpiPath,
      installUrl,
    });

    console.log(
      `[sign:firefox-release] Signed Firefox Release bundle ready in ${path.relative(
        extensionRoot,
        prepared.outputDir
      )}`
    );
  } catch (error) {
    console.error(
      `[sign:firefox-release] ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}
