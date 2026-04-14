import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

const testFiles = [
  'tests/google-auth-config.test.ts',
  'tests/google-auth-misconfig.test.ts',
  'tests/google-auth-invalid-token.test.ts',
  'tests/google-auth.test.ts',
] as const;

let currentIndex = 0;
let hasFailures = false;

function runNextTest(): void {
  if (currentIndex >= testFiles.length) {
    process.exit(hasFailures ? 1 : 0);
    return;
  }

  const testFile = testFiles[currentIndex];
  if (testFile === undefined) {
    hasFailures = true;
    process.exit(1);
    return;
  }

  const child: ChildProcess = spawn(
    'node',
    ['--import', 'tsx', '--test', '--test-force-exit', testFile],
    {
      cwd: path.join(currentDirPath, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: process.env.PORT ?? '3010',
      },
    }
  );

  child.on('close', (code: number | null) => {
    if (code !== 0) {
      hasFailures = true;
    }
    currentIndex += 1;
    setTimeout(runNextTest, 300);
  });

  child.on('error', () => {
    hasFailures = true;
    currentIndex += 1;
    setTimeout(runNextTest, 300);
  });
}

runNextTest();
