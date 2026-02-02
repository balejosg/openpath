/**
 * Winston Logger for OpenPath Dashboard
 *
 * Provides structured JSON logging with timestamps and log levels.
 */

import winston from 'winston';

const logLevel = process.env.LOG_LEVEL ?? 'info';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'dashboard' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  ],
});
