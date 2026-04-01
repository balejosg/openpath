/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import express from 'express';
import type { ErrorRequestHandler, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { getErrorMessage } from '@openpath/shared';

import { config } from './config.js';
import { requestIdMiddleware, errorTrackingMiddleware } from './lib/error-tracking.js';
import { cleanupBlacklist } from './lib/auth.js';
import { logger } from './lib/logger.js';
import * as roleStorage from './lib/role-storage.js';
import * as userStorage from './lib/user-storage.js';
import { isCookieAuthenticatedMutation, isTrustedCsrfOrigin } from './lib/server-request-auth.js';
import { appRouter } from './trpc/routers/index.js';
import { createContext } from './trpc/context.js';
import { logTrpcError } from './trpc/trpc.js';
import { registerPublicRequestRoutes } from './routes/public-requests.js';
import { registerCoreRoutes } from './routes/core.js';
import { registerExtensionRoutes } from './routes/extensions.js';
import { registerSetupRoutes } from './routes/setup.js';
import { registerEnrollmentRoutes } from './routes/enrollment.js';
import { registerMachineRoutes } from './routes/machines.js';
import { registerTestSupportRoutes } from './routes/test-support.js';

let swaggerUi: typeof import('swagger-ui-express') | undefined;
let getSwaggerSpec: (() => object) | undefined;

if (config.enableSwagger) {
  try {
    swaggerUi = await import('swagger-ui-express');
    const swaggerModule = await import('./lib/swagger.js');
    getSwaggerSpec = swaggerModule.getSwaggerSpec;
    logger.debug('Swagger documentation enabled');
  } catch (err) {
    logger.warn('Swagger dependencies not installed - skipping documentation', { error: err });
  }
} else {
  logger.info('Swagger documentation disabled via configuration');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
let testNowOverride: Date | null = null;

function getCurrentEvaluationTime(): Date {
  return config.isTest && testNowOverride !== null ? new Date(testNowOverride) : new Date();
}

function setTestNowOverride(nextValue: Date | null): void {
  testNowOverride = nextValue;
}

if (config.trustProxy !== undefined) {
  app.set('trust proxy', config.trustProxy);
  logger.info('Express trust proxy configured', { trustProxy: config.trustProxy });
}

const PORT = config.port;
const HOST = config.host;

const connectSrcDirectives = ["'self'", 'https://accounts.google.com'];
if (!config.isProduction) {
  connectSrcDirectives.push('http://localhost:*', 'ws://localhost:*');
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://accounts.google.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
        frameSrc: ["'self'", 'https://accounts.google.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: connectSrcDirectives,
      },
    },
    frameguard: { action: 'deny' },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);

const corsOrigins = config.corsAllowedOrigins;
const trustedBrowserOrigins = [
  ...corsOrigins,
  ...(config.publicUrl ? [new URL(config.publicUrl).origin] : []),
];

if (config.isProduction) {
  if (corsOrigins.length === 0) {
    logger.warn('CORS_ORIGINS not set in production - all cross-origin requests will be blocked');
  } else if (corsOrigins.includes('*')) {
    logger.warn('CORS_ORIGINS="*" in production - this is insecure, set explicit origins');
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, corsOrigins.includes(origin));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'trpc-batch-mode'],
    credentials: true,
  })
);

const globalLimiter = rateLimit({
  windowMs: config.globalRateLimitWindowMs,
  max: config.globalRateLimitMax,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later',
    code: 'GLOBAL_RATE_LIMITED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || (config.isTest && !config.enableRateLimitInTest),
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMax,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
    code: 'AUTH_RATE_LIMITED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  skip: () => config.isTest && !config.enableRateLimitInTest,
});

const publicRequestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'Too many domain requests, please try again later',
    code: 'REQUEST_RATE_LIMITED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  skip: () => config.isTest && !config.enableRateLimitInTest,
});

app.use('/trpc/auth.login', authLimiter);
app.use('/trpc/auth.register', authLimiter);
app.use('/trpc/auth.googleLogin', authLimiter);
app.use('/trpc/auth.resetPassword', authLimiter);
app.use('/trpc/setup.createFirstAdmin', authLimiter);
app.use('/api/setup/first-admin', authLimiter);

app.use('/trpc/requests.create', publicRequestLimiter);
app.use('/api/requests/auto', publicRequestLimiter);
app.use('/api/requests/submit', publicRequestLimiter);

app.use(express.json({ limit: '10kb' }));
app.use(requestIdMiddleware);

app.use((req: Request, res: Response, next) => {
  if (!isCookieAuthenticatedMutation(req)) {
    next();
    return;
  }

  if (isTrustedCsrfOrigin(req, trustedBrowserOrigins)) {
    next();
    return;
  }

  logger.warn('Rejected cookie-authenticated request with invalid CSRF origin', {
    path: req.originalUrl || req.url,
    method: req.method,
    origin: req.get('origin'),
    referer: req.get('referer'),
    requestOrigin: `${req.protocol}://${req.get('host') ?? 'localhost'}`,
  });

  res.status(403).json({
    success: false,
    error: 'Invalid CSRF origin',
    code: 'FORBIDDEN',
    requestId: (req as Request & { id?: string }).id,
  });
});

app.use(logger.requestMiddleware);

app.use(
  compression({
    filter: (req, res) => {
      if (req.path === '/api/machines/events') return false;
      return compression.filter(req, res);
    },
  })
);

registerCoreRoutes(app);
registerExtensionRoutes(app);
registerPublicRequestRoutes(app);
registerSetupRoutes(app);
registerEnrollmentRoutes(app);
registerTestSupportRoutes(app, { getCurrentEvaluationTime, setTestNowOverride });
registerMachineRoutes(app, { getCurrentEvaluationTime });

if (swaggerUi && getSwaggerSpec) {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(getSwaggerSpec(), {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'OpenPath API Documentation',
    })
  );
  app.get('/api-docs.json', (_req: Request, res: Response): void => {
    res.setHeader('Content-Type', 'application/json');
    res.send(getSwaggerSpec());
  });
}

app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ path, ctx, error }) {
      logTrpcError({ path, ctx, error });
    },
  })
);

app.use('/v2', (_req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

const isCompiledCode = __dirname.includes('/dist');
const reactSpaPath = isCompiledCode
  ? path.join(__dirname, '../../../react-spa/dist')
  : path.join(__dirname, '../../react-spa/dist');

logger.info('React SPA path check', {
  path: reactSpaPath,
  exists: fs.existsSync(reactSpaPath),
  __dirname,
  isCompiledCode,
});

if (fs.existsSync(reactSpaPath)) {
  app.use(express.static(reactSpaPath));
  logger.info('React SPA enabled at /');
}

if (fs.existsSync(reactSpaPath)) {
  app.get(/.*/, (req: Request, res: Response, next) => {
    const url = req.originalUrl || req.url;
    if (url.startsWith('/api') || url.startsWith('/trpc') || url.startsWith('/api-docs')) {
      next();
      return;
    }
    res.sendFile(path.join(reactSpaPath, 'index.html'));
  });
}

interface SyntaxErrorWithBody extends SyntaxError {
  status?: number;
  body?: unknown;
}

const jsonErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof SyntaxError && (err as SyntaxErrorWithBody).status === 400 && 'body' in err) {
    res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body',
      code: 'INVALID_JSON',
    });
    return;
  }
  next(err);
};
app.use(jsonErrorHandler);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.path,
  });
});

app.use(errorTrackingMiddleware);

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

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
const shouldStartServer = isMainModule || process.env.OPENPATH_FORCE_SERVER_START === 'true';

if (shouldStartServer) {
  const serverStartTime = new Date();

  if (process.env.SKIP_DB_MIGRATIONS !== 'true') {
    const { initializeSchema } = await import('./db/index.js');
    await initializeSchema();
  } else {
    logger.warn('Skipping database migrations (SKIP_DB_MIGRATIONS=true)');
  }

  server = app.listen(PORT, HOST, () => {
    void (async (): Promise<void> => {
      try {
        await cleanupBlacklist();
        logger.info('Token blacklist cleanup completed');
      } catch (error) {
        logger.warn('Token blacklist cleanup failed', { error: getErrorMessage(error) });
      }

      logger.info('Server started', {
        host: HOST,
        port: String(PORT),
        env: process.env.NODE_ENV,
        apiId: process.env.API_ID,
        startup_time: {
          start: serverStartTime.toISOString(),
          elapsed_ms: String(Date.now() - serverStartTime.getTime()),
        },
      });

      if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
        const existingAdmin = await userStorage
          .getUserByEmail(process.env.ADMIN_EMAIL)
          .catch(() => null);

        if (!existingAdmin) {
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
      }

      logger.info('');
      logger.info('╔═══════════════════════════════════════════════════════╗');
      logger.info('║       OpenPath Request API Server                     ║');
      logger.info('╚═══════════════════════════════════════════════════════╝');
      const baseUrl = config.publicUrl ?? `http://${HOST}:${String(PORT)}`;
      logger.info(`Server is running on ${baseUrl}`);
      if (swaggerUi) {
        logger.info(`API Documentation: ${baseUrl}/api-docs`);
      }
      logger.info(`Health Check: ${baseUrl}/health`);
      logger.info('─────────────────────────────────────────────────────────');
      logger.info('');
    })();
  });

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

export { app, server };
