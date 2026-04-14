import { after, before } from 'node:test';

import { startHttpTestHarness, type HttpTestHarness } from './http-test-harness.js';
import { parseTRPC as parseTRPCBase } from './test-utils.js';

let harness: HttpTestHarness | undefined;

function getHarness(): HttpTestHarness {
  if (harness === undefined) {
    throw new Error('Backup HTTP harness has not been initialized');
  }

  return harness;
}

export function registerBackupLifecycle(): void {
  before(async () => {
    harness = await startHttpTestHarness({
      env: {
        SHARED_SECRET: 'test-backup-secret',
      },
      cleanup: async () => {
        const { resetTokenStore } = await import('../src/lib/token-store.js');
        resetTokenStore();
      },
      readyDelayMs: 1_000,
    });
  });

  after(async () => {
    await harness?.close();
    harness = undefined;
  });
}

export function getApiUrl(): string {
  return getHarness().apiUrl;
}

export async function trpcMutate(
  procedure: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  return getHarness().trpcMutate(procedure, input, headers);
}

export async function trpcQuery(
  procedure: string,
  input?: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  return getHarness().trpcQuery(procedure, input, headers);
}

export { parseTRPCBase as parseTRPC };
