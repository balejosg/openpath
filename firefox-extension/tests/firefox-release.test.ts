import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const extensionRoot = path.resolve(import.meta.dirname, '..');

interface FirefoxReleaseMetadata {
  extensionId: string;
  version: string;
  installUrl?: string;
}

interface PrepareFirefoxReleaseArtifactsResult {
  outputDir: string;
  outputXpiPath: string;
  metadataPath: string;
  metadata: FirefoxReleaseMetadata;
}

interface PrepareFirefoxReleaseArtifactsModule {
  prepareFirefoxReleaseArtifacts: (options: {
    extensionRoot?: string;
    signedXpiPath: string;
    installUrl?: string;
    outputDir?: string;
    manifestPath?: string;
    extensionId?: string;
    version?: string;
  }) => PrepareFirefoxReleaseArtifactsResult;
}

interface SignFirefoxReleaseModule {
  buildWebExtSignArgs: (options: {
    apiKey: string;
    apiSecret: string;
    artifactsDir: string;
    sourceDir?: string;
  }) => string[];
  findSignedXpiArtifact: (artifactsDir: string) => string;
  prepareSigningSourceDir: (options: { sourceDir?: string; version?: string }) => {
    sourceDir: string;
    effectiveVersion: string;
    cleanup: () => void;
  };
}

const { prepareFirefoxReleaseArtifacts } =
  (await import('../build-firefox-release.mjs')) as PrepareFirefoxReleaseArtifactsModule;
const { buildWebExtSignArgs, findSignedXpiArtifact, prepareSigningSourceDir } =
  (await import('../sign-firefox-release.mjs')) as SignFirefoxReleaseModule;

const tempDirectories: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirectories.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirectories.length > 0) {
    const dir = tempDirectories.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

void describe('Firefox release signing helpers', () => {
  void test('build-xpi.sh falls back when zip is unavailable', () => {
    const workingDir = createTempDir('openpath-build-xpi-');
    const fixtureDir = path.join(workingDir, 'extension');
    const fakeBinDir = path.join(workingDir, 'bin');
    const version = '9.9.9';
    const xpiPath = path.join(fixtureDir, `monitor-bloqueos-red-${version}.xpi`);

    mkdirSync(fixtureDir, { recursive: true });
    mkdirSync(fakeBinDir, { recursive: true });
    mkdirSync(path.join(fixtureDir, 'popup'), { recursive: true });
    mkdirSync(path.join(fixtureDir, 'icons'), { recursive: true });
    mkdirSync(path.join(fixtureDir, 'blocked'), { recursive: true });
    mkdirSync(path.join(fixtureDir, 'dist'), { recursive: true });

    writeFileSync(
      path.join(fixtureDir, 'manifest.json'),
      `${JSON.stringify({ version }, null, 2)}\n`
    );
    writeFileSync(path.join(fixtureDir, 'PRIVACY.md'), '# Privacy\n');
    writeFileSync(path.join(fixtureDir, 'popup', 'index.html'), '<html></html>\n');
    writeFileSync(path.join(fixtureDir, 'icons', 'icon.svg'), '<svg />\n');
    writeFileSync(path.join(fixtureDir, 'blocked', 'index.html'), '<html>blocked</html>\n');
    writeFileSync(path.join(fixtureDir, 'dist', 'background.js'), 'console.log("ok");\n');
    writeFileSync(
      path.join(fixtureDir, 'build-xpi.sh'),
      readFileSync(path.join(extensionRoot, 'build-xpi.sh'))
    );
    writeFileSync(
      path.join(fakeBinDir, 'zip'),
      '#!/bin/sh\necho "zip unavailable" >&2\nexit 127\n'
    );
    chmodSync(path.join(fakeBinDir, 'zip'), 0o755);

    execFileSync('bash', ['build-xpi.sh'], {
      cwd: fixtureDir,
      env: {
        ...process.env,
        PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`,
      },
      encoding: 'utf8',
    });

    assert.ok(
      existsSync(xpiPath),
      'build-xpi.sh should still create the XPI when zip is unavailable'
    );
    assert.equal(readFileSync(xpiPath).subarray(0, 2).toString('utf8'), 'PK');
  });

  void test('prepareFirefoxReleaseArtifacts writes metadata and copies the signed XPI', () => {
    const workingDir = createTempDir('openpath-firefox-release-');
    const signedXpiPath = path.join(workingDir, 'signed-input.xpi');
    const outputDir = path.join(workingDir, 'firefox-release');

    writeFileSync(signedXpiPath, 'signed-xpi-payload');

    const result = prepareFirefoxReleaseArtifacts({
      extensionRoot,
      signedXpiPath,
      installUrl: 'https://downloads.example/openpath-firefox-extension.xpi',
      outputDir,
    });

    assert.equal(result.metadata.extensionId, 'monitor-bloqueos@openpath');
    assert.equal(result.metadata.version, '2.0.0');
    assert.equal(
      result.metadata.installUrl,
      'https://downloads.example/openpath-firefox-extension.xpi'
    );
    assert.equal(result.outputXpiPath, path.join(outputDir, 'openpath-firefox-extension.xpi'));
    assert.equal(result.metadataPath, path.join(outputDir, 'metadata.json'));
  });

  void test('buildWebExtSignArgs requests unlisted signing with explicit artifact output', () => {
    const args = buildWebExtSignArgs({
      apiKey: 'user:123:456',
      apiSecret: 'top-secret',
      artifactsDir: 'build/firefox-release/raw-signed',
      sourceDir: extensionRoot,
    });

    assert.deepEqual(args, [
      '--yes',
      'web-ext',
      'sign',
      '--channel=unlisted',
      `--source-dir=${extensionRoot}`,
      '--artifacts-dir=build/firefox-release/raw-signed',
      '--api-key=user:123:456',
      '--api-secret=top-secret',
    ]);
  });

  void test('findSignedXpiArtifact picks the newest XPI from the artifacts directory', () => {
    const artifactsDir = createTempDir('openpath-firefox-artifacts-');
    const olderXpiPath = path.join(artifactsDir, 'older.xpi');
    const newerXpiPath = path.join(artifactsDir, 'newer.xpi');

    writeFileSync(olderXpiPath, 'older');
    writeFileSync(newerXpiPath, 'newer');
    utimesSync(olderXpiPath, new Date('2026-03-26T10:00:00Z'), new Date('2026-03-26T10:00:00Z'));
    utimesSync(newerXpiPath, new Date('2026-03-26T11:00:00Z'), new Date('2026-03-26T11:00:00Z'));

    assert.equal(findSignedXpiArtifact(artifactsDir), newerXpiPath);
  });

  void test('prepareSigningSourceDir can override the manifest version in a temporary copy', () => {
    const signingSource = prepareSigningSourceDir({
      sourceDir: extensionRoot,
      version: '2.0.0.123.4',
    });

    try {
      assert.notEqual(
        signingSource.sourceDir,
        extensionRoot,
        'version override should use a temporary signing directory'
      );
      assert.equal(signingSource.effectiveVersion, '2.0.0.123.4');

      const manifest = JSON.parse(
        readFileSync(path.join(signingSource.sourceDir, 'manifest.json'), 'utf8')
      ) as { version?: string };
      assert.equal(manifest.version, '2.0.0.123.4');
    } finally {
      signingSource.cleanup();
    }
  });
});
