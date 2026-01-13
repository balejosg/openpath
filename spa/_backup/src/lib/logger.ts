/**
 * Browser Logger for OpenPath SPA
 *
 * Provides structured logging with timestamps and log levels.
 * Debug logs are only shown in development mode.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

// Vite env interface
interface ImportMetaEnv {
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly MODE: string;
}

// Vite type for import.meta
interface ImportMeta {
    readonly env: ImportMetaEnv;
}

// Check if running in development mode
// Vite sets import.meta.env.DEV to true during development
function isDev(): boolean {
    return (import.meta as unknown as ImportMeta).env.DEV;
}

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

export const logger = {
    /**
     * Log debug message (only in development)
     * Uses console.warn to comply with eslint no-console rule
     */
    debug: (message: string, context?: LogContext): void => {
        if (isDev()) {
            // In browser, debug goes to warn since console.debug/log are restricted
            console.warn(formatMessage('debug', message, context));
        }
    },

    /**
     * Log info message
     * Uses console.warn to comply with eslint no-console rule
     */
    info: (message: string, context?: LogContext): void => {
        // In browser, info goes to warn since console.info/log are restricted
        console.warn(formatMessage('info', message, context));
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
