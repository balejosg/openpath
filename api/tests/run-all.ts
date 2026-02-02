/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Test Runner for running all test suites sequentially
 *
 * This script runs each test file in a separate child process to avoid
 * module cache conflicts when multiple test files need to start servers.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

const testFiles: readonly string[] = [
  'tests/api.test.ts',
  'tests/auth.test.ts',
  'tests/drizzle.test.ts',
  'tests/roles.test.ts',
  'tests/blocked-domains.test.ts',
  'tests/classrooms.test.ts',
  'tests/push.test.ts',
  'tests/github.test.ts',
  'tests/security.test.ts',
  'tests/integration.test.ts',
  'tests/e2e.test.ts',
  'tests/storage.test.ts',
  'tests/token-store.test.ts',
];

let currentIndex = 0;
let hasFailures = false;

function runNextTest(): void {
  if (currentIndex >= testFiles.length) {
    console.log('\n' + '='.repeat(60));
    if (hasFailures) {
      console.log('❌ Some tests failed');
      process.exit(1);
    } else {
      console.log('✅ All test suites completed successfully');
      process.exit(0);
    }
    return;
  }

  const testFile = testFiles[currentIndex];
  if (testFile === undefined) {
    console.error('Unexpected undefined test file');
    process.exit(1);
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Running: ${testFile}`);
  console.log('='.repeat(60) + '\n');

  const child: ChildProcess = spawn(
    'node',
    ['--import', 'tsx', '--test', '--test-force-exit', testFile],
    {
      cwd: path.join(currentDirPath, '..'),
      stdio: 'inherit',
      env: { ...process.env, PORT: '3006' },
    }
  );

  // Timeout to kill hanging tests after 30 seconds
  const timeout = setTimeout((): void => {
    console.log(`\n⚠️  Test ${testFile} timed out after 30s, killing...`);
    child.kill('SIGKILL');
  }, 30000);

  child.on('close', (code: number | null): void => {
    clearTimeout(timeout);
    if (code !== 0) {
      hasFailures = true;
    }
    currentIndex++;
    // Small delay between test files to ensure port cleanup
    setTimeout(runNextTest, 500);
  });

  child.on('error', (err: Error): void => {
    clearTimeout(timeout);
    console.error(`Failed to run ${testFile}:`, err);
    hasFailures = true;
    currentIndex++;
    setTimeout(runNextTest, 500);
  });
}

console.log('🧪 Running all test suites...\n');
runNextTest();
