import { after, before } from 'node:test';

import { startHttpTestHarness, type HttpTestHarness } from './http-test-harness.js';
import {
  parseTRPC as parseTRPCBase,
  resetDb,
  trpcMutate as trpcMutateBase,
  trpcQuery as trpcQueryBase,
  uniqueEmail,
} from './test-utils.js';

let harness: HttpTestHarness | undefined;

export function registerSetupHttpLifecycle(): void {
  before(async () => {
    harness = await startHttpTestHarness({
      readyDelayMs: 1_000,
      resetDb: true,
      resetDbOnClose: true,
    });
  });

  after(async () => {
    await harness?.close();
    harness = undefined;
  });
}

function getHarness(): HttpTestHarness {
  if (harness === undefined) {
    throw new Error('Setup HTTP harness has not been initialized');
  }

  return harness;
}

export function uniqueSetupEmail(prefix: string): string {
  return uniqueEmail(prefix);
}

export async function trpcMutate(
  procedure: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  return trpcMutateBase(getHarness().apiUrl, procedure, input, headers);
}

export async function trpcQuery(
  procedure: string,
  input?: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  return trpcQueryBase(getHarness().apiUrl, procedure, input, headers);
}

export { parseTRPCBase as parseTRPC, resetDb };
