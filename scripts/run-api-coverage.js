#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const createReport = require('c8/lib/report.js');
const { checkCoverages } = require('c8/lib/commands/check-coverage.js');

const ROOT_DIR = resolve(import.meta.dirname, '..');
const API_DIR = resolve(ROOT_DIR, 'api');
const shell = process.env.SHELL || '/bin/sh';

const dbHost = process.env.DB_HOST ?? 'localhost';
const dbPort = process.env.DB_PORT ?? '5433';
const dbName = process.env.DB_NAME ?? 'openpath_test';
const dbUser = process.env.DB_USER ?? 'openpath';
const dbPassword = process.env.DB_PASSWORD ?? 'openpath_test';

const testEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? 'test',
  DB_HOST: dbHost,
  DB_PORT: dbPort,
  DB_NAME: dbName,
  DB_USER: dbUser,
  DB_PASSWORD: dbPassword,
  DATABASE_URL: `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`,
};

function collectTopLevelTestFiles(dirPath) {
  return readdirSync(dirPath, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name, 'en')
  );
}

function collectCoverageTestFiles(packageJson) {
  const testsDir = resolve(API_DIR, 'tests');
  const topLevelFiles = collectTopLevelTestFiles(testsDir)
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => `tests/${entry.name}`);

  const scriptedFiles = Array.from(
    new Set((packageJson.scripts?.test ?? '').match(/tests\/[^\s"]+?\.test\.ts/g) ?? [])
  );

  return Array.from(new Set([...topLevelFiles, ...scriptedFiles])).sort((left, right) =>
    left.localeCompare(right, 'en')
  );
}

function getCoverageConfig() {
  return JSON.parse(readFileSync(resolve(API_DIR, 'package.json'), 'utf8'));
}

function getCoverageReport(config) {
  const reportsDirectory = resolve(API_DIR, config['reports-dir'] ?? 'coverage');
  const tempDirectory = resolve(API_DIR, config['temp-directory'] ?? 'coverage/tmp');
  const configuredReporters = Array.isArray(config.reporter)
    ? config.reporter
    : [config.reporter ?? 'text'];
  const reporter = Array.from(new Set([...configuredReporters, 'json']));

  return {
    report: createReport({
      include: config.include ?? [],
      exclude: config.exclude,
      extension: config.extension,
      excludeAfterRemap: config['exclude-after-remap'] ?? false,
      reporter,
      reporterOptions: config['reporter-options'] ?? {},
      reportsDirectory,
      tempDirectory,
      watermarks: config.watermarks,
      resolve: config.resolve ?? '',
      omitRelative: config['omit-relative'] ?? true,
      wrapperLength: config['wrapper-length'],
      all: config.all ?? false,
      src: config.src,
      allowExternal: config.allowExternal ?? false,
      skipFull: config['skip-full'] ?? false,
      excludeNodeModules: config['exclude-node-modules'] ?? true,
      mergeAsync: config['merge-async'] ?? false,
    }),
    reportsDirectory,
    tempDirectory,
  };
}

function run(command, cwd = ROOT_DIR, env = testEnv) {
  const result = spawnSync(command, {
    cwd,
    env,
    stdio: 'inherit',
    shell,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command}`);
  }
}

function runCapture(command, cwd = ROOT_DIR, env = testEnv) {
  return spawnSync(command, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell,
    encoding: 'utf8',
  });
}

function wait(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function waitForPostgresHealthy() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = runCapture(
      "docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' openpath-test-db"
    );

    if (result.status === 0 && result.stdout.trim() === 'healthy') {
      return;
    }

    await wait(1000);
  }

  throw new Error('Timed out waiting for openpath-test-db to become healthy');
}

let failureCode = 0;

try {
  run('docker compose -f docker-compose.test.yml down -v');
  run('docker compose -f docker-compose.test.yml up -d');
  await waitForPostgresHealthy();

  run('npm run db:setup:e2e --workspace=@openpath/api');
  const packageJson = getCoverageConfig();
  const coverageConfig = packageJson.c8 ?? {};
  const { report, reportsDirectory, tempDirectory } = getCoverageReport(coverageConfig);
  const baseCoverageEnv = {
    ...testEnv,
    PORT: testEnv.PORT ?? '3006',
    NODE_V8_COVERAGE: tempDirectory,
  };
  const testFiles = collectCoverageTestFiles(packageJson);

  rmSync(reportsDirectory, { recursive: true, force: true });
  mkdirSync(tempDirectory, { recursive: true });

  try {
    for (const testFile of testFiles) {
      const perTestEnv = {
        ...baseCoverageEnv,
      };

      if (testFile === 'tests/security.test.ts') {
        perTestEnv.ENABLE_RATE_LIMIT_IN_TEST = testEnv.ENABLE_RATE_LIMIT_IN_TEST ?? 'true';
      } else {
        delete perTestEnv.ENABLE_RATE_LIMIT_IN_TEST;
      }

      run(
        `node --import tsx --test --test-force-exit --test-concurrency=1 ${testFile}`,
        API_DIR,
        perTestEnv
      );
    }

    await report.run();

    if (coverageConfig['check-coverage']) {
      await checkCoverages(
        {
          lines: coverageConfig.lines ?? 90,
          functions: coverageConfig.functions ?? 0,
          branches: coverageConfig.branches ?? 0,
          statements: coverageConfig.statements ?? 0,
          perFile: coverageConfig['per-file'] ?? false,
        },
        report
      );
    }

    if (process.exitCode && process.exitCode !== 0) {
      process.exit(process.exitCode);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
} catch (error) {
  failureCode = 1;
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
} finally {
  try {
    run('docker compose -f docker-compose.test.yml down', ROOT_DIR, process.env);
  } catch (teardownError) {
    failureCode = failureCode || 1;
    if (teardownError instanceof Error) {
      console.error(teardownError.message);
    } else {
      console.error(String(teardownError));
    }
  }
}

if (failureCode !== 0) {
  process.exit(failureCode);
}
