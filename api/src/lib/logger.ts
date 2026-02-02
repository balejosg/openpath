/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Structured logging with Winston
 * Provides consistent log format across the application
 */

import winston from 'winston';
import type { Request, Response, NextFunction } from 'express';

// =============================================================================
// Types
// =============================================================================

interface LogMeta {
  requestId?: string;
  [key: string]: unknown;
}

interface ChildLogger {
  info: (msg: string, extra?: Record<string, unknown>) => void;
  warn: (msg: string, extra?: Record<string, unknown>) => void;
  error: (msg: string, extra?: Record<string, unknown>) => void;
  debug: (msg: string, extra?: Record<string, unknown>) => void;
}

interface RequestWithId extends Request {
  id?: string;
}

interface RequestLogData {
  requestId: string | undefined;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userAgent: string | undefined;
  ip: string | undefined;
  slow?: boolean | undefined;
  threshold?: number | undefined;
}

// =============================================================================
// Configuration
// =============================================================================

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug');

// Slow request threshold (configurable via env, default 1000ms)
const SLOW_REQUEST_THRESHOLD_MS = parseInt(process.env.SLOW_REQUEST_THRESHOLD_MS ?? '1000', 10);

// =============================================================================
// Formats
// =============================================================================

// Custom format for development (colorized, readable)
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    const reqId = requestId !== undefined && requestId !== null ? `[${requestId as string}]` : '';
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp as string} ${level}: ${reqId} ${message as string}${metaStr}`;
  })
);

// Custom format for production (JSON for log aggregation)
const prodFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());

// =============================================================================
// Logger Instance
// =============================================================================

const baseLogger = winston.createLogger({
  level: logLevel,
  format: isProduction ? prodFormat : devFormat,
  defaultMeta: { service: 'openpath-api' },
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
});

// Add file transport in production
if (isProduction) {
  baseLogger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
  baseLogger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// =============================================================================
// Logger API
// =============================================================================

/**
 * Create a child logger with request context
 */
function createChildLogger(meta: LogMeta): ChildLogger {
  return {
    info: (msg: string, extra: Record<string, unknown> = {}): void => {
      baseLogger.info(msg, { ...meta, ...extra });
    },
    warn: (msg: string, extra: Record<string, unknown> = {}): void => {
      baseLogger.warn(msg, { ...meta, ...extra });
    },
    error: (msg: string, extra: Record<string, unknown> = {}): void => {
      baseLogger.error(msg, { ...meta, ...extra });
    },
    debug: (msg: string, extra: Record<string, unknown> = {}): void => {
      baseLogger.debug(msg, { ...meta, ...extra });
    },
  };
}

/**
 * Express middleware for request logging with slow request detection
 */
function requestMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Redact download tokens from path to prevent leaking secrets in logs
  const safePath = req.path.startsWith('/w/')
    ? req.path.replace(/^\/w\/[^/]+/, '/w/[REDACTED]')
    : req.path;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const isSlow = duration > SLOW_REQUEST_THRESHOLD_MS;

    // Determine log level: error for 5xx, warn for 4xx or slow, info for success
    let level: 'info' | 'warn' | 'error' = 'info';
    if (res.statusCode >= 500) {
      level = 'error';
    } else if (res.statusCode >= 400 || isSlow) {
      level = 'warn';
    }

    const logData: RequestLogData = {
      requestId: req.id,
      method: req.method,
      path: safePath,
      statusCode: res.statusCode,
      durationMs: duration,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    };

    // Add slow request flag for alerting
    if (isSlow) {
      logData.slow = true;
      logData.threshold = SLOW_REQUEST_THRESHOLD_MS;
    }

    const message = `${req.method} ${safePath} ${String(res.statusCode)} ${String(duration)}ms${isSlow ? ' [SLOW]' : ''}`;
    baseLogger[level](message, logData);
  });

  next();
}

// =============================================================================
// Logger Object (compatible with existing API)
// =============================================================================

export const logger = {
  info: (message: string, meta?: Record<string, unknown>): void => {
    baseLogger.info(message, meta);
  },
  warn: (message: string, meta?: Record<string, unknown>): void => {
    baseLogger.warn(message, meta);
  },
  error: (message: string, meta?: Record<string, unknown>): void => {
    baseLogger.error(message, meta);
  },
  debug: (message: string, meta?: Record<string, unknown>): void => {
    baseLogger.debug(message, meta);
  },
  child: createChildLogger,
  requestMiddleware,
};
