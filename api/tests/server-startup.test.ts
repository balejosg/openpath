import { spawn, type ChildProcess } from 'node:child_process';
import { after, describe, test } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as userStorage from '../src/lib/user-storage.js';
import { closeConnection } from '../src/db/index.js';
import { getAvailablePort, resetDb, uniqueEmail } from './test-utils.js';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 200
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out after ${String(timeoutMs)}ms`);
}

async function waitForHealth(baseUrl: string): Promise<void> {
  await waitFor(async () => {
    try {
      const response = await fetch(`${baseUrl}/health`);
      return response.status === 200;
    } catch {
      return false;
    }
  }, 15000);
}

async function waitForAdmin(
  email: string
): Promise<NonNullable<Awaited<ReturnType<typeof userStorage.getUserByEmail>>>> {
  let foundUser!: NonNullable<Awaited<ReturnType<typeof userStorage.getUserByEmail>>>;

  await waitFor(async () => {
    const user = await userStorage.getUserByEmail(email);
    if (user === null) {
      return false;
    }

    foundUser = user;
    return true;
  }, 15000);

  return foundUser;
}

function waitForExit(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null) {
    return Promise.resolve(child.exitCode);
  }

  return new Promise((resolve, reject) => {
    child.once('exit', (code) => {
      resolve(code);
    });
    child.once('error', reject);
  });
}

after(async () => {
  await closeConnection();
});

void describe('Server startup coverage', () => {
  void test(
    'runs the main-module startup path, handles invalid JSON, 404s, and graceful shutdown',
    { timeout: 30000 },
    async () => {
      await resetDb();

      const port = await getAvailablePort();
      const baseUrl = `http://127.0.0.1:${String(port)}`;
      const adminEmail = uniqueEmail('startup-admin');
      const childOutput: string[] = [];

      const child = spawn('node', ['--import', 'tsx', 'src/server.ts'], {
        cwd: apiRoot,
        env: {
          ...process.env,
          HOST: '127.0.0.1',
          PORT: String(port),
          NODE_ENV: 'test',
          JWT_SECRET: 'startup-test-secret',
          SKIP_DB_MIGRATIONS: 'true',
          ADMIN_EMAIL: adminEmail,
          ADMIN_PASSWORD: 'StartupPassword123!',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.on('data', (chunk: Buffer | string) => {
        childOutput.push(String(chunk));
      });
      child.stderr.on('data', (chunk: Buffer | string) => {
        childOutput.push(String(chunk));
      });

      try {
        await waitForHealth(baseUrl);

        const invalidJsonResponse = await fetch(`${baseUrl}/trpc/auth.login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{',
        });
        assert.strictEqual(invalidJsonResponse.status, 400);
        const invalidJsonBody = (await invalidJsonResponse.json()) as { code?: string };
        assert.strictEqual(invalidJsonBody.code, 'INVALID_JSON');

        const missingRouteResponse = await fetch(`${baseUrl}/api/missing-route`);
        assert.strictEqual(missingRouteResponse.status, 404);
        const missingRouteBody = (await missingRouteResponse.json()) as {
          code?: string;
          path?: string;
        };
        assert.strictEqual(missingRouteBody.code, 'NOT_FOUND');
        assert.strictEqual(missingRouteBody.path, '/api/missing-route');

        const createdAdmin = await waitForAdmin(adminEmail);
        assert.strictEqual(createdAdmin.emailVerified, true);
      } finally {
        child.kill('SIGTERM');
        const exitCode = await waitForExit(child);
        assert.strictEqual(
          exitCode,
          0,
          `Expected graceful shutdown. Output:\n${childOutput.join('')}`
        );
      }
    }
  );
});
