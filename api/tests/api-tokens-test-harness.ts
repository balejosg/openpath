import { after, before } from 'node:test';

import * as userStorage from '../src/lib/user-storage.js';
import { startHttpTestHarness, type HttpTestHarness } from './http-test-harness.js';
import { parseTRPC as parseTRPCBase, uniqueEmail } from './test-utils.js';

let harness: HttpTestHarness | undefined;
let authToken: string | null = null;

function getHarness(): HttpTestHarness {
  if (harness === undefined) {
    throw new Error('API token removal harness has not been initialized');
  }

  return harness;
}

export function registerApiTokensLifecycle(): void {
  before(async () => {
    harness = await startHttpTestHarness({
      cleanup: async () => {
        const { resetTokenStore } = await import('../src/lib/token-store.js');
        resetTokenStore();
      },
      readyDelayMs: 500,
      resetDb: true,
    });

    const email = uniqueEmail('tokens-removed');
    const password = 'SecurePassword123!';

    await userStorage.createUser(
      {
        email,
        password,
        name: 'Removed Token Surface User',
      },
      { emailVerified: true }
    );

    const loginResponse = await getHarness().trpcMutate('auth.login', { email, password });
    if (loginResponse.status !== 200) {
      throw new Error(`Expected login to succeed, got ${String(loginResponse.status)}`);
    }

    const { data } = (await parseTRPCBase(loginResponse)) as { data?: { accessToken?: string } };
    if (data?.accessToken === undefined || data.accessToken === '') {
      throw new Error('Expected login response to return an access token');
    }
    authToken = data.accessToken;
  });

  after(async () => {
    await harness?.close();
    harness = undefined;
    authToken = null;
  });
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

export function getBearerAuth(): Record<string, string> {
  if (authToken === null) {
    throw new Error('Expected authenticated token surface test token to be initialized');
  }

  return {
    Authorization: `Bearer ${authToken}`,
  };
}
