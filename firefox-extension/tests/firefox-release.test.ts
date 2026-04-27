import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
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
  computeFirefoxReleasePayloadHash: (options: { sourceDir?: string }) => string;
  findSignedXpiArtifact: (artifactsDir: string) => string;
  parseWebExtThrottleDelaySeconds: (output: string) => number | null;
  prepareSigningSourceDir: (options: { sourceDir?: string; version?: string }) => {
    sourceDir: string;
    effectiveVersion: string;
    cleanup: () => void;
  };
  runWebExtSignWithRetry: (options: {
    args: string[];
    cwd: string;
    env?: NodeJS.ProcessEnv;
    spawnSyncImpl?: (
      command: string,
      args: string[],
      options: { cwd: string; encoding: 'utf8' }
    ) => SpawnSyncReturns<string>;
    sleepSyncImpl?: (milliseconds: number) => void;
    stdout?: { write: (chunk: string) => unknown };
    stderr?: { write: (chunk: string) => unknown };
  }) => SpawnSyncReturns<string> | { status: number };
}

const { prepareFirefoxReleaseArtifacts } =
  (await import('../build-firefox-release.mjs')) as PrepareFirefoxReleaseArtifactsModule;
const {
  buildWebExtSignArgs,
  computeFirefoxReleasePayloadHash,
  findSignedXpiArtifact,
  parseWebExtThrottleDelaySeconds,
  prepareSigningSourceDir,
  runWebExtSignWithRetry,
} = (await import('../sign-firefox-release.mjs')) as SignFirefoxReleaseModule;

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

  void test('parseWebExtThrottleDelaySeconds reads AMO throttling responses', () => {
    assert.equal(
      parseWebExtThrottleDelaySeconds(
        'WebExtError: Submission failed (2): Unknown Error\n' +
          '{ "detail": "Request was throttled. Expected available in 631 seconds." }'
      ),
      631
    );
    assert.equal(parseWebExtThrottleDelaySeconds('WebExtError: unrelated failure'), null);
  });

  void test('runWebExtSignWithRetry waits and retries AMO throttling responses', () => {
    const attempts: string[] = [];
    const waits: number[] = [];
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const spawnSyncImpl = (
      command: string,
      args: string[],
      options: { cwd: string; encoding: 'utf8' }
    ): SpawnSyncReturns<string> => {
      attempts.push(`${command} ${args.join(' ')} ${options.cwd} ${options.encoding}`);
      if (attempts.length === 1) {
        return {
          status: 1,
          signal: null,
          output: [],
          pid: 123,
          stdout: '',
          stderr:
            'WebExtError: Submission failed (2): Unknown Error\n' +
            '{ "detail": "Request was throttled. Expected available in 631 seconds." }\n',
        };
      }

      return {
        status: 0,
        signal: null,
        output: [],
        pid: 124,
        stdout: 'signed\n',
        stderr: '',
      };
    };

    const result = runWebExtSignWithRetry({
      args: ['--yes', 'web-ext', 'sign'],
      cwd: extensionRoot,
      env: {
        WEB_EXT_SIGN_MAX_RETRIES: '1',
        WEB_EXT_SIGN_RETRY_BUFFER_SECONDS: '2',
        WEB_EXT_SIGN_MAX_THROTTLE_WAIT_SECONDS: '900',
      },
      spawnSyncImpl,
      sleepSyncImpl: (milliseconds) => waits.push(milliseconds),
      stdout: { write: (chunk) => stdoutChunks.push(chunk) },
      stderr: { write: (chunk) => stderrChunks.push(chunk) },
    });

    assert.equal(result.status, 0);
    assert.equal(attempts.length, 2);
    assert.deepEqual(waits, [633_000]);
    assert.deepEqual(stdoutChunks, ['signed\n']);
    assert.equal(stderrChunks.length, 1);
    assert.match(stderrChunks[0] ?? '', /Request was throttled/);
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

  void test('prepareSigningSourceDir copies only the Firefox runtime signing payload', () => {
    const workingDir = createTempDir('openpath-firefox-signing-source-');
    const sourceDir = path.join(workingDir, 'extension');

    mkdirSync(path.join(sourceDir, 'dist'), { recursive: true });
    mkdirSync(path.join(sourceDir, 'popup'), { recursive: true });
    mkdirSync(path.join(sourceDir, 'blocked'), { recursive: true });
    mkdirSync(path.join(sourceDir, 'icons'), { recursive: true });
    mkdirSync(path.join(sourceDir, 'src'), { recursive: true });
    mkdirSync(path.join(sourceDir, 'tests'), { recursive: true });
    mkdirSync(path.join(sourceDir, 'native'), { recursive: true });

    writeFileSync(
      path.join(sourceDir, 'manifest.json'),
      `${JSON.stringify({
        version: '3.2.1',
        browser_specific_settings: { gecko: { id: 'monitor-bloqueos@openpath' } },
      })}\n`
    );
    writeFileSync(path.join(sourceDir, 'dist', 'background.js'), 'console.log("runtime");\n');
    writeFileSync(path.join(sourceDir, 'popup', 'popup.html'), '<html></html>\n');
    writeFileSync(path.join(sourceDir, 'blocked', 'blocked.html'), '<html>blocked</html>\n');
    writeFileSync(path.join(sourceDir, 'icons', 'icon-48.png'), 'icon\n');
    writeFileSync(path.join(sourceDir, 'src', 'background.ts'), 'source only\n');
    writeFileSync(path.join(sourceDir, 'tests', 'background.test.ts'), 'test only\n');
    writeFileSync(path.join(sourceDir, 'native', 'openpath-native-host.py'), 'native only\n');
    writeFileSync(path.join(sourceDir, 'README.md'), '# Docs\n');

    const signingSource = prepareSigningSourceDir({ sourceDir });

    try {
      assert.notEqual(signingSource.sourceDir, sourceDir);
      assert.equal(statSync(path.join(signingSource.sourceDir, 'dist')).isDirectory(), true);
      assert.equal(statSync(path.join(signingSource.sourceDir, 'popup')).isDirectory(), true);
      assert.equal(statSync(path.join(signingSource.sourceDir, 'blocked')).isDirectory(), true);
      assert.equal(statSync(path.join(signingSource.sourceDir, 'icons')).isDirectory(), true);
      assert.equal(existsSync(path.join(signingSource.sourceDir, 'src')), false);
      assert.equal(existsSync(path.join(signingSource.sourceDir, 'tests')), false);
      assert.equal(existsSync(path.join(signingSource.sourceDir, 'native')), false);
      assert.equal(existsSync(path.join(signingSource.sourceDir, 'README.md')), false);
    } finally {
      signingSource.cleanup();
    }
  });

  void test('computeFirefoxReleasePayloadHash ignores non-runtime extension files', () => {
    const workingDir = createTempDir('openpath-firefox-payload-hash-');
    const sourceDir = path.join(workingDir, 'extension');

    mkdirSync(path.join(sourceDir, 'dist'), { recursive: true });
    mkdirSync(path.join(sourceDir, 'popup'), { recursive: true });
    mkdirSync(path.join(sourceDir, 'blocked'), { recursive: true });
    mkdirSync(path.join(sourceDir, 'icons'), { recursive: true });
    mkdirSync(path.join(sourceDir, 'native'), { recursive: true });

    writeFileSync(
      path.join(sourceDir, 'manifest.json'),
      `${JSON.stringify({
        version: '3.2.1',
        browser_specific_settings: { gecko: { id: 'monitor-bloqueos@openpath' } },
      })}\n`
    );
    writeFileSync(path.join(sourceDir, 'dist', 'background.js'), 'console.log("runtime");\n');
    writeFileSync(path.join(sourceDir, 'popup', 'popup.html'), '<html></html>\n');
    writeFileSync(path.join(sourceDir, 'blocked', 'blocked.html'), '<html>blocked</html>\n');
    writeFileSync(path.join(sourceDir, 'icons', 'icon-48.png'), 'icon\n');
    writeFileSync(path.join(sourceDir, 'native', 'openpath-native-host.py'), 'native only\n');
    writeFileSync(path.join(sourceDir, 'README.md'), '# Docs\n');

    const originalHash = computeFirefoxReleasePayloadHash({ sourceDir });

    writeFileSync(path.join(sourceDir, 'native', 'openpath-native-host.py'), 'native changed\n');
    writeFileSync(path.join(sourceDir, 'README.md'), '# Docs changed\n');

    assert.equal(computeFirefoxReleasePayloadHash({ sourceDir }), originalHash);

    writeFileSync(path.join(sourceDir, 'dist', 'background.js'), 'console.log("changed");\n');

    assert.notEqual(computeFirefoxReleasePayloadHash({ sourceDir }), originalHash);
  });
});
