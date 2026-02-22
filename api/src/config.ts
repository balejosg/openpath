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

// Parse DATABASE_URL if provided, otherwise use individual env vars
const parsedDbUrl = parseDatabaseUrl(process.env.DATABASE_URL);

export const config = {
  // ==========================================================================
  // Server Configuration
  // ==========================================================================

  /** Server port */
  port: parseIntEnv(process.env.PORT, 3000),

  /** Server host binding */
  host: process.env.HOST ?? '0.0.0.0',

  /** Public URL (for logs and references) */
  publicUrl: process.env.PUBLIC_URL,

  /** Node environment */
  nodeEnv: process.env.NODE_ENV ?? 'development',

  /** Express trust proxy setting (optional) */
  trustProxy: parseTrustProxyEnv(process.env.TRUST_PROXY),

  /** Is production environment */
  isProduction: process.env.NODE_ENV === 'production',

  /** Is test environment */
  isTest: process.env.NODE_ENV === 'test',

  /** APT Repository Setup URL */
  aptRepoUrl: process.env.APT_REPO_URL ?? 'https://balejosg.github.io/openpath/apt',

  /** Enable rate limiting even in test environment (defaults to false) */
  enableRateLimitInTest: process.env.ENABLE_RATE_LIMIT_IN_TEST === 'true',

  // ==========================================================================
  // Security Configuration
  // ==========================================================================

  /** Bcrypt hashing rounds for password hashing */
  bcryptRounds: parseIntEnv(process.env.BCRYPT_ROUNDS, 12),

  /** JWT secret for token signing */
  jwtSecret: process.env.JWT_SECRET ?? 'openpath-dev-secret-change-in-production',

  /** JWT access token expiration */
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY ?? '15m',

  /** JWT refresh token expiration */
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? '7d',

  // ==========================================================================
  // Google OAuth Configuration
  // ==========================================================================

  /** Google OAuth Client ID for Sign In with Google */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',

  // ==========================================================================
  // Rate Limiting
  // ==========================================================================

  /** Global rate limit window in milliseconds */
  globalRateLimitWindowMs: parseIntEnv(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000),

  /** Global rate limit max requests per window */
  globalRateLimitMax: parseIntEnv(process.env.RATE_LIMIT_MAX, 200),

  /** Auth rate limit window in milliseconds */
  authRateLimitWindowMs: parseIntEnv(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 60 * 1000),

  /** Auth rate limit max requests per window */
  authRateLimitMax: parseIntEnv(process.env.AUTH_RATE_LIMIT_MAX, 10),

  // ==========================================================================
  // CORS Configuration
  // ==========================================================================

  /** CORS allowed origins (comma-separated). MUST be set in production. */
  corsAllowedOrigins: parseListEnv(
    process.env.CORS_ORIGINS,
    process.env.NODE_ENV === 'production'
      ? [] // Production MUST set CORS_ORIGINS explicitly
      : ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:3000']
  ),

  // ==========================================================================
  // Push Notifications
  // ==========================================================================

  /** VAPID public key for web push */
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',

  /** VAPID private key for web push */
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',

  /** VAPID subject (email or URL) */
  vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:admin@openpath.local',

  /** Push notification icon path */
  pushIconPath: process.env.PUSH_ICON_PATH ?? '/icon-192.png',

  /** Push notification badge path */
  pushBadgePath: process.env.PUSH_BADGE_PATH ?? '/badge.png',

  // ==========================================================================
  // Database Configuration
  // ==========================================================================

  /** PostgreSQL connection URL */
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://openpath:openpath@localhost:5432/openpath',

  /** Database settings - uses DATABASE_URL if provided, otherwise individual env vars */
  database: {
    host: parsedDbUrl?.host ?? process.env.DB_HOST ?? 'localhost',
    port: parsedDbUrl?.port ?? parseIntEnv(process.env.DB_PORT, 5432),
    name: parsedDbUrl?.name ?? process.env.DB_NAME ?? 'openpath',
    user: parsedDbUrl?.user ?? process.env.DB_USER ?? 'openpath',
    password: parsedDbUrl?.password ?? process.env.DB_PASSWORD ?? 'openpath_dev',
    poolMax: parseIntEnv(process.env.DB_POOL_MAX, 20),
  },

  // ==========================================================================
  // Logging
  // ==========================================================================

  /** Log level (debug, info, warn, error) */
  logLevel: process.env.LOG_LEVEL ?? 'info',

  /** Enable Swagger documentation (defaults to true in non-production) */
  enableSwagger: process.env.NODE_ENV !== 'production' && process.env.ENABLE_SWAGGER !== 'false',
} as const;

export type Config = typeof config;
