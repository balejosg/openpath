import { config } from '../config.js';

export function getJwtSecret(): string {
  return config.jwtSecret;
}

export function getJwtAccessExpiry(): string {
  return config.jwtAccessExpiry;
}

export function getJwtRefreshExpiry(): string {
  return config.jwtRefreshExpiry;
}

// Compatibility exports for modules/tests that import the configured values directly.
export const JWT_SECRET = config.jwtSecret;
export const JWT_EXPIRES_IN = config.jwtAccessExpiry;
