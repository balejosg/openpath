import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
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
}

const { prepareFirefoxReleaseArtifacts } =
  (await import('../build-firefox-release.mjs')) as PrepareFirefoxReleaseArtifactsModule;
const { buildWebExtSignArgs, findSignedXpiArtifact } =
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
});
