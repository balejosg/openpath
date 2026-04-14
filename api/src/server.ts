/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import 'dotenv/config';

import { getErrorMessage } from '@openpath/shared';

import { createApp } from './app.js';
import { config } from './config.js';
import { cleanupBlacklist } from './lib/auth.js';
import { logger } from './lib/logger.js';
import * as roleStorage from './lib/role-storage.js';
import * as userStorage from './lib/user-storage.js';

const { app } = await createApp(config);

let server: ReturnType<typeof app.listen> | undefined;
let isShuttingDown = false;
const SHUTDOWN_TIMEOUT_MS = 30000;

const gracefulShutdown = (signal: string): void => {
  if (isShuttingDown) {
    logger.warn(`Shutdown already in progress, ignoring ${signal}`);
    return;
  }
  isShuttingDown = true;

  logger.info(`Received ${signal}, starting graceful shutdown...`);

  const forceShutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  const finish = (exitCode: number): void => {
    clearTimeout(forceShutdownTimeout);
    process.exit(exitCode);
  };

  if (server === undefined) {
    logger.info('No active server instance to close');
    finish(0);
    return;
  }

  server.close((err) => {
    if (err) {
      logger.error('Error during server close', { error: err.message });
      finish(1);
      return;
    }
    logger.info('Server closed, no longer accepting connections');
    finish(0);
  });
};

async function ensureDefaultAdminFromEnv(): Promise<void> {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    return;
  }

  const existingAdmin = await userStorage.getUserByEmail(process.env.ADMIN_EMAIL).catch(() => null);
  if (existingAdmin) {
    return;
  }

  logger.info('Creating default admin user from environment variables...');

  try {
    const admin = await userStorage.createUser(
      {
        email: process.env.ADMIN_EMAIL,
        name: 'System Admin',
        password: process.env.ADMIN_PASSWORD,
      },
      { emailVerified: true }
    );

    await roleStorage.assignRole({
      userId: admin.id,
      role: 'admin',
      groupIds: [],
    });

    logger.info(`Default admin user created: ${admin.email}`);
  } catch (error) {
    logger.error('Failed to create default admin user', { error: getErrorMessage(error) });
  }
}

async function startServer(): Promise<ReturnType<typeof app.listen>> {
  const port = config.port;
  const host = config.host;
  const serverStartTime = new Date();

  if (process.env.SKIP_DB_MIGRATIONS !== 'true') {
    const { initializeSchema } = await import('./db/index.js');
    await initializeSchema();
  } else {
    logger.warn('Skipping database migrations (SKIP_DB_MIGRATIONS=true)');
  }

  return app.listen(port, host, () => {
    void (async (): Promise<void> => {
      try {
        await cleanupBlacklist();
        logger.info('Token blacklist cleanup completed');
      } catch (error) {
        logger.warn('Token blacklist cleanup failed', { error: getErrorMessage(error) });
      }

      logger.info('Server started', {
        host,
        port: String(port),
        env: process.env.NODE_ENV,
        apiId: process.env.API_ID,
        startup_time: {
          start: serverStartTime.toISOString(),
          elapsed_ms: String(Date.now() - serverStartTime.getTime()),
        },
      });

      await ensureDefaultAdminFromEnv();

      logger.info('');
      logger.info('╔═══════════════════════════════════════════════════════╗');
      logger.info('║       OpenPath Request API Server                     ║');
      logger.info('╚═══════════════════════════════════════════════════════╝');
      const baseUrl = config.publicUrl ?? `http://${host}:${String(port)}`;
      logger.info(`Server is running on ${baseUrl}`);
      if (config.enableSwagger) {
        logger.info(`API Documentation: ${baseUrl}/api-docs`);
      }
      logger.info(`Health Check: ${baseUrl}/health`);
      logger.info('─────────────────────────────────────────────────────────');
      logger.info('');
    })();
  });
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
const shouldStartServer = isMainModule || process.env.OPENPATH_FORCE_SERVER_START === 'true';

if (shouldStartServer) {
  server = await startServer();

  process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    gracefulShutdown('SIGINT');
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', {
      error: err.message,
      stack: err.stack,
    });
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

export { app, server, startServer };
