import compression from 'compression';
import cors from 'cors';
import express from 'express';
import type { ErrorRequestHandler, Request, Response } from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';

import { createExpressMiddleware } from '@trpc/server/adapters/express';

import type { Config } from './config.js';
import { config as defaultConfig } from './config.js';
import { requestIdMiddleware, errorTrackingMiddleware } from './lib/error-tracking.js';
import { logger } from './lib/logger.js';
import { isCookieAuthenticatedMutation, isTrustedCsrfOrigin } from './lib/server-request-auth.js';
import { registerPublicRequestRoutes } from './routes/public-requests.js';
import { registerCoreRoutes } from './routes/core.js';
import { registerExtensionRoutes } from './routes/extensions.js';
import { registerSetupRoutes } from './routes/setup.js';
import { registerEnrollmentRoutes } from './routes/enrollment.js';
import { registerMachineRoutes } from './routes/machines.js';
import { registerTestSupportRoutes } from './routes/test-support.js';
import { createContext } from './trpc/context.js';
import { appRouter } from './trpc/routers/index.js';
import { logTrpcError } from './trpc/trpc.js';

export interface CreatedApp {
  app: express.Express;
}

interface SyntaxErrorWithBody extends SyntaxError {
  body?: unknown;
  status?: number;
}

export async function createApp(runtimeConfig: Config = defaultConfig): Promise<CreatedApp> {
  let swaggerUi: typeof import('swagger-ui-express') | undefined;
  let getSwaggerSpec: (() => object) | undefined;

  if (runtimeConfig.enableSwagger) {
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
    return runtimeConfig.isTest && testNowOverride !== null
      ? new Date(testNowOverride)
      : new Date();
  }

  function setTestNowOverride(nextValue: Date | null): void {
    testNowOverride = nextValue;
  }

  if (runtimeConfig.trustProxy !== undefined) {
    app.set('trust proxy', runtimeConfig.trustProxy);
    logger.info('Express trust proxy configured', { trustProxy: runtimeConfig.trustProxy });
  }

  const connectSrcDirectives = ["'self'", 'https://accounts.google.com'];
  if (!runtimeConfig.isProduction) {
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

  const corsOrigins = runtimeConfig.corsAllowedOrigins;
  const trustedBrowserOrigins = [
    ...corsOrigins,
    ...(runtimeConfig.publicUrl ? [new URL(runtimeConfig.publicUrl).origin] : []),
  ];

  if (runtimeConfig.isProduction) {
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
    windowMs: runtimeConfig.globalRateLimitWindowMs,
    max: runtimeConfig.globalRateLimitMax,
    message: {
      success: false,
      error: 'Too many requests from this IP, please try again later',
      code: 'GLOBAL_RATE_LIMITED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      req.path === '/health' || (runtimeConfig.isTest && !runtimeConfig.enableRateLimitInTest),
  });
  app.use(globalLimiter);

  const authLimiter = rateLimit({
    windowMs: runtimeConfig.authRateLimitWindowMs,
    max: runtimeConfig.authRateLimitMax,
    message: {
      success: false,
      error: 'Too many authentication attempts, please try again later',
      code: 'AUTH_RATE_LIMITED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip ?? 'unknown',
    skip: () => runtimeConfig.isTest && !runtimeConfig.enableRateLimitInTest,
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
    skip: () => runtimeConfig.isTest && !runtimeConfig.enableRateLimitInTest,
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

  const jsonErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
    if (
      err instanceof SyntaxError &&
      (err as SyntaxErrorWithBody).status === 400 &&
      'body' in err
    ) {
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

  return { app };
}

export default {
  createApp,
};
