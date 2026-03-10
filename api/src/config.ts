/**
 * OpenPath API Configuration
 *
 * Centralized configuration management.
 * All values can be overridden via environment variables.
 */

/**
 * Parse an integer from environment with fallback
 */
function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Parse a boolean from environment with fallback
 */
function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

/**
 * Parse a comma-separated list from environment
 */
function parseListEnv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse Express trust proxy setting.
 *
 * Supported values:
 * - "true"/"false" (boolean)
 * - Integer string (trusted hop count)
 * - Any other string is passed through (proxy-addr supports CIDRs and named ranges)
 */
function parseTrustProxyEnv(value: string | undefined): boolean | number | string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;

  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  return trimmed;
}

/**
 * Parse DATABASE_URL into individual components
 * Format: postgres://user:password@host:port/database
 */
function parseDatabaseUrl(url: string | undefined): {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
} | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 5432,
      name: parsed.pathname.slice(1), // Remove leading /
      user: parsed.username,
      password: decodeURIComponent(parsed.password),
    };
  } catch {
    return null;
  }
}

interface LoadedConfig {
  readonly port: number;
  readonly host: string;
  readonly publicUrl: string | undefined;
  readonly nodeEnv: string;
  readonly trustProxy: boolean | number | string | undefined;
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly aptRepoUrl: string;
  readonly enableRateLimitInTest: boolean;
  readonly bcryptRounds: number;
  readonly jwtSecret: string;
  readonly jwtAccessExpiry: string;
  readonly jwtRefreshExpiry: string;
  readonly autoApproveMachineRequests: boolean;
  readonly googleClientId: string;
  readonly globalRateLimitWindowMs: number;
  readonly globalRateLimitMax: number;
  readonly authRateLimitWindowMs: number;
  readonly authRateLimitMax: number;
  readonly corsAllowedOrigins: string[];
  readonly vapidPublicKey: string;
  readonly vapidPrivateKey: string;
  readonly vapidSubject: string;
  readonly pushIconPath: string;
  readonly pushBadgePath: string;
  readonly databaseUrl: string;
  readonly database: {
    readonly host: string;
    readonly port: number;
    readonly name: string;
    readonly user: string;
    readonly password: string;
    readonly poolMax: number;
  };
  readonly logLevel: string;
  readonly enableSwagger: boolean;
}

export function loadConfig(
  env: Readonly<Record<string, string | undefined>> = process.env
): LoadedConfig {
  const parsedDbUrl = parseDatabaseUrl(env.DATABASE_URL);
  const nodeEnv = env.NODE_ENV ?? 'development';

  return {
    // ==========================================================================
    // Server Configuration
    // ==========================================================================

    /** Server port */
    port: parseIntEnv(env.PORT, 3000),

    /** Server host binding */
    host: env.HOST ?? '0.0.0.0',

    /** Public URL (for logs and references) */
    publicUrl: env.PUBLIC_URL,

    /** Node environment */
    nodeEnv,

    /** Express trust proxy setting (optional) */
    trustProxy: parseTrustProxyEnv(env.TRUST_PROXY),

    /** Is production environment */
    isProduction: nodeEnv === 'production',

    /** Is test environment */
    isTest: nodeEnv === 'test',

    /** APT Repository Setup URL */
    aptRepoUrl: env.APT_REPO_URL ?? 'https://balejosg.github.io/openpath/apt',

    /** Enable rate limiting even in test environment (defaults to false) */
    enableRateLimitInTest: parseBooleanEnv(env.ENABLE_RATE_LIMIT_IN_TEST, false),

    // ==========================================================================
    // Security Configuration
    // ==========================================================================

    /** Bcrypt hashing rounds for password hashing */
    bcryptRounds: parseIntEnv(env.BCRYPT_ROUNDS, 12),

    /** JWT secret for token signing */
    jwtSecret: env.JWT_SECRET ?? 'openpath-dev-secret-change-in-production',

    /** JWT access token expiration */
    jwtAccessExpiry: env.JWT_ACCESS_EXPIRY ?? env.JWT_EXPIRES_IN ?? '15m',

    /** JWT refresh token expiration */
    jwtRefreshExpiry: env.JWT_REFRESH_EXPIRY ?? env.JWT_REFRESH_EXPIRES_IN ?? '7d',

    /** Allow machine auto-request endpoint to approve immediately only when explicitly enabled */
    autoApproveMachineRequests: parseBooleanEnv(env.AUTO_APPROVE_MACHINE_REQUESTS, false),

    // ==========================================================================
    // Google OAuth Configuration
    // ==========================================================================

    /** Google OAuth Client ID for Sign In with Google */
    googleClientId: env.GOOGLE_CLIENT_ID ?? '',

    // ==========================================================================
    // Rate Limiting
    // ==========================================================================

    /** Global rate limit window in milliseconds */
    globalRateLimitWindowMs: parseIntEnv(env.RATE_LIMIT_WINDOW_MS, 60 * 1000),

    /** Global rate limit max requests per window */
    globalRateLimitMax: parseIntEnv(env.RATE_LIMIT_MAX, 200),

    /** Auth rate limit window in milliseconds */
    authRateLimitWindowMs: parseIntEnv(env.AUTH_RATE_LIMIT_WINDOW_MS, 60 * 1000),

    /** Auth rate limit max requests per window */
    authRateLimitMax: parseIntEnv(env.AUTH_RATE_LIMIT_MAX, 10),

    // ==========================================================================
    // CORS Configuration
    // ==========================================================================

    /** CORS allowed origins (comma-separated). MUST be set in production. */
    corsAllowedOrigins: parseListEnv(
      env.CORS_ORIGINS,
      nodeEnv === 'production'
        ? [] // Production MUST set CORS_ORIGINS explicitly
        : ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:3000']
    ),

    // ==========================================================================
    // Push Notifications
    // ==========================================================================

    /** VAPID public key for web push */
    vapidPublicKey: env.VAPID_PUBLIC_KEY ?? '',

    /** VAPID private key for web push */
    vapidPrivateKey: env.VAPID_PRIVATE_KEY ?? '',

    /** VAPID subject (email or URL) */
    vapidSubject: env.VAPID_SUBJECT ?? 'mailto:admin@openpath.local',

    /** Push notification icon path */
    pushIconPath: env.PUSH_ICON_PATH ?? '/icon-192.png',

    /** Push notification badge path */
    pushBadgePath: env.PUSH_BADGE_PATH ?? '/badge.png',

    // ==========================================================================
    // Database Configuration
    // ==========================================================================

    /** PostgreSQL connection URL */
    databaseUrl: env.DATABASE_URL ?? 'postgres://openpath:openpath@localhost:5432/openpath',

    /** Database settings - uses DATABASE_URL if provided, otherwise individual env vars */
    database: {
      host: parsedDbUrl?.host ?? env.DB_HOST ?? 'localhost',
      port: parsedDbUrl?.port ?? parseIntEnv(env.DB_PORT, 5432),
      name: parsedDbUrl?.name ?? env.DB_NAME ?? 'openpath',
      user: parsedDbUrl?.user ?? env.DB_USER ?? 'openpath',
      password: parsedDbUrl?.password ?? env.DB_PASSWORD ?? 'openpath_dev',
      poolMax: parseIntEnv(env.DB_POOL_MAX, 20),
    },

    // ==========================================================================
    // Logging
    // ==========================================================================

    /** Log level (debug, info, warn, error) */
    logLevel: env.LOG_LEVEL ?? 'info',

    /** Enable Swagger documentation (defaults to true in non-production) */
    enableSwagger: nodeEnv !== 'production' && env.ENABLE_SWAGGER !== 'false',
  } as const;
}

export const config = loadConfig();

export type Config = LoadedConfig;
