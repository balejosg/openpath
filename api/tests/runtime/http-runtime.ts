import type { Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

import { closeConnection } from '../../src/db/index.js';
import { bootstrapAdminSession } from './auth.js';
import { resetDb } from './db.js';
import { ensureTestSchema } from './schema.js';
import { getAvailablePort } from './ports.js';
import {
  closeServer,
  applyEnvOverrides,
  resetProcessTestState,
  restoreEnv,
} from './process-state.js';
import { trpcMutate, trpcQuery } from './trpc.js';

interface ListenableApp {
  listen: (port: number, host: string, callback?: () => void) => Server;
}

export interface StartApiTestRuntimeOptions {
  cleanup?: () => Promise<void> | void;
  ensureSchema?: boolean;
  env?: Record<string, string | undefined>;
  loadApp?: () => Promise<ListenableApp>;
  readyDelayMs?: number;
  resetDb?: boolean;
  resetDbOnClose?: boolean;
}

export interface ApiTestRuntime {
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

export async function startApiTestRuntime(
  options: StartApiTestRuntimeOptions = {}
): Promise<ApiTestRuntime> {
  const port = await getAvailablePort();
  const host = '127.0.0.1';
  const apiUrl = `http://${host}:${String(port)}`;
  const previousEnv = applyEnvOverrides({
    ADMIN_EMAIL: undefined,
    ADMIN_PASSWORD: undefined,
    HOST: host,
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
              import('../../src/app.js'),
              import('../../src/config.js'),
            ]);
            return (await createApp(loadConfig(process.env))).app;
          })();

    server = await new Promise<Server>((resolve) => {
      const startedServer = app.listen(port, host, () => {
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
    bootstrapAdminSession: (input) => bootstrapAdminSession(apiUrl, input),
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
    trpcMutate: (procedure, input, headers = {}) => trpcMutate(apiUrl, procedure, input, headers),
    trpcQuery: (procedure, input, headers = {}) => trpcQuery(apiUrl, procedure, input, headers),
  };
}
