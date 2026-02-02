/**
 * Browser Logger for OpenPath Firefox Extension
 *
 * Provides structured logging with timestamps and log levels.
 * Debug logs are only shown when DEBUG mode is enabled.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

// Extension can check for debug mode via storage or manifest
// Toggle for development: set to true to enable debug logging
// eslint-disable-next-line @typescript-eslint/no-inferrable-types
let DEBUG: boolean = false;

/**
 * Enable or disable debug logging at runtime
 */
export function setDebug(enabled: boolean): void {
  DEBUG = enabled;
}

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

export const logger = {
  /**
   * Log debug message (only when DEBUG is true)
   */
  debug: (message: string, context?: LogContext): void => {
    if (DEBUG) {
      console.debug(formatMessage('debug', message, context));
    }
  },

  /**
   * Log info message
   */
  info: (message: string, context?: LogContext): void => {
    console.info(formatMessage('info', message, context));
  },

  /**
   * Log warning message
   */
  warn: (message: string, context?: LogContext): void => {
    console.warn(formatMessage('warn', message, context));
  },

  /**
   * Log error message
   */
  error: (message: string, context?: LogContext): void => {
    console.error(formatMessage('error', message, context));
  },
};

export type { LogContext, LogLevel };
