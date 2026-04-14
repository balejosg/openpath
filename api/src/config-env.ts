/**
 * OpenPath API Configuration helpers.
 */

export function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

export function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function parseListEnv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseTrustProxyEnv(
  value: string | undefined
): boolean | number | string | undefined {
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

const DEFAULT_DEV_JWT_SECRET = 'openpath-dev-secret-change-in-production';
const TEST_JWT_SECRET = 'openpath-test-secret';

export function resolveJwtSecret(
  env: Readonly<Record<string, string | undefined>>,
  nodeEnv: string
): string {
  const rawSecret = env.JWT_SECRET?.trim();

  if (nodeEnv === 'test') {
    return rawSecret && rawSecret.length > 0 ? rawSecret : TEST_JWT_SECRET;
  }

  if (!rawSecret) {
    throw new Error('JWT_SECRET must be set when NODE_ENV is not test');
  }

  if (rawSecret === DEFAULT_DEV_JWT_SECRET) {
    throw new Error('JWT_SECRET must not use the built-in default outside test mode');
  }

  return rawSecret;
}

export function parseDatabaseUrl(url: string | undefined): {
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
      name: parsed.pathname.slice(1),
      user: parsed.username,
      password: decodeURIComponent(parsed.password),
    };
  } catch {
    return null;
  }
}
