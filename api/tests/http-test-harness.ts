import type { Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

import { closeConnection } from '../src/db/index.js';
import {
  bootstrapAdminSession as bootstrapAdminSessionBase,
  ensureTestSchema,
  getAvailablePort,
  resetDb,
  trpcMutate as trpcMutateBase,
  trpcQuery as trpcQueryBase,
} from './test-utils.js';

interface ListenableApp {
  listen: (port: number, callback?: () => void) => Server;
}

export interface StartHttpTestHarnessOptions {
  cleanup?: () => Promise<void> | void;
  ensureSchema?: boolean;
  env?: Record<string, string | undefined>;
  loadApp?: () => Promise<ListenableApp>;
  readyDelayMs?: number;
  resetDb?: boolean;
  resetDbOnClose?: boolean;
}

export interface HttpTestHarness {
  apiUrl: string;
  bootstrapAdminSession: (input?: {
    email?: string;
    password?: string;
    name?: string;
  }) => Promise<{ accessToken: string; email: string; password: string }>;
  close: () => Promise<void>;
  port: number;
  trpcMutate: (
    procedure: string,
    input: unknown,
    headers?: Record<string, string>
  ) => Promise<Response>;
  trpcQuery: (
    procedure: string,
    input?: unknown,
    headers?: Record<string, string>
  ) => Promise<Response>;
}

function applyEnvOverrides(
  env: Record<string, string | undefined>
): Map<string, string | undefined> {
  const previousValues = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(env)) {
    previousValues.set(key, process.env[key]);
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }

  return previousValues;
}

function restoreEnv(previousValues: Map<string, string | undefined>): void {
  for (const [key, value] of previousValues.entries()) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (server === undefined) {
    return;
  }

  if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }

  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

async function resetProcessTestState(
  env: Readonly<Record<string, string | undefined>> = process.env
): Promise<void> {
  const [{ loadConfig, setConfigForTests }, { resetTokenStore }] = await Promise.all([
    import('../src/config.js'),
    import('../src/lib/token-store.js'),
  ]);

  setConfigForTests(loadConfig(env));
  resetTokenStore();
}

export async function startHttpTestHarness(
  options: StartHttpTestHarnessOptions = {}
): Promise<HttpTestHarness> {
  const port = await getAvailablePort();
  const apiUrl = `http://localhost:${String(port)}`;
  const previousEnv = applyEnvOverrides({
    NODE_ENV: 'test',
    PORT: String(port),
    ...options.env,
  });

  let server: Server | undefined;
  let closed = false;

  try {
    if (options.resetDb) {
      await resetDb();
    } else if (options.ensureSchema) {
      await ensureTestSchema();
    }

    await resetProcessTestState(process.env);

    const app =
      options.loadApp !== undefined
        ? await options.loadApp()
        : await (async (): Promise<ListenableApp> => {
            const [{ createApp }, { loadConfig }] = await Promise.all([
              import('../src/app.js'),
              import('../src/config.js'),
            ]);
            return (await createApp(loadConfig(process.env))).app;
          })();

    server = await new Promise<Server>((resolve) => {
      const startedServer = app.listen(port, () => {
        resolve(startedServer);
      });
    });

    if ((options.readyDelayMs ?? 0) > 0) {
      await delay(options.readyDelayMs);
    }
  } catch (error) {
    await closeServer(server);
    await closeConnection();
    restoreEnv(previousEnv);
    await resetProcessTestState(process.env);
    throw error;
  }

  return {
    apiUrl,
    bootstrapAdminSession: (input) => bootstrapAdminSessionBase(apiUrl, input),
    close: async (): Promise<void> => {
      if (closed) {
        return;
      }
      closed = true;

      await closeServer(server);

      if (options.cleanup !== undefined) {
        await options.cleanup();
      }

      if (options.resetDbOnClose) {
        await resetDb();
      }

      await closeConnection();
      restoreEnv(previousEnv);
      await resetProcessTestState(process.env);
    },
    port,
    trpcMutate: (procedure, input, headers = {}) =>
      trpcMutateBase(apiUrl, procedure, input, headers),
    trpcQuery: (procedure, input, headers = {}) => trpcQueryBase(apiUrl, procedure, input, headers),
  };
}
