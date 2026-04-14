import { after, before } from 'node:test';

interface TRPCResponse<T = unknown> {
  error?: { code: string; message: string };
  result?: { data: T };
}

type HttpTestHarness = import('./http-test-harness.js').HttpTestHarness;

export function createGoogleAuthHarness(
  options: {
    googleClientId?: string;
  } = {}
): {
  getApiUrl: () => string;
  parseTRPC: (response: Response) => Promise<{ code?: string; data?: unknown; error?: string }>;
  registerLifecycle: () => void;
  trpcMutate: (procedure: string, input: unknown) => Promise<Response>;
} {
  let harness: HttpTestHarness | undefined;

  function getHarness(): HttpTestHarness {
    if (harness === undefined) {
      throw new Error('Google auth HTTP harness has not been initialized');
    }

    return harness;
  }

  function registerLifecycle(): void {
    before(async () => {
      process.env.JWT_SECRET = 'test-secret-key-for-google-auth-unit-tests';
      if (options.googleClientId === undefined) {
        Reflect.deleteProperty(process.env, 'GOOGLE_CLIENT_ID');
      } else {
        process.env.GOOGLE_CLIENT_ID = options.googleClientId;
      }

      const { startHttpTestHarness } = await import('./http-test-harness.js');

      harness = await startHttpTestHarness({
        env: {
          GOOGLE_CLIENT_ID: options.googleClientId,
        },
        readyDelayMs: 500,
      });
    });

    after(async () => {
      await harness?.close();
      harness = undefined;
    });
  }

  return {
    getApiUrl: () => getHarness().apiUrl,
    parseTRPC: async (response: Response): Promise<{ code?: string; data?: unknown; error?: string }> => {
      const json = (await response.json()) as TRPCResponse;
      if (json.result !== undefined) {
        return { data: json.result.data };
      }
      if (json.error !== undefined) {
        return { code: json.error.code, error: json.error.message };
      }
      return {};
    },
    registerLifecycle,
    trpcMutate: async (procedure: string, input: unknown): Promise<Response> =>
      getHarness().trpcMutate(procedure, input),
  };
}
