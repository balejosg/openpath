/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Machine Download Token - Crypto utilities for machine whitelist tokens
 *
 * Tokens are used for unauthenticated whitelist downloads.
 * The server stores only the hash; the token is revealed once at generation.
 */

import crypto from 'node:crypto';

/**
 * Generate a cryptographically secure machine download token.
 * Returns a 32-byte random value encoded as base64url (43 characters).
 *
 * @returns The token in cleartext (store only the hash!)
 */
export function generateMachineToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Hash a machine token using SHA-256.
 * The hash is stored in the database for lookup.
 *
 * @param token - The cleartext token
 * @returns SHA-256 hash as lowercase hex (64 characters)
 */
export function hashMachineToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Build a whitelist download URL for a machine.
 *
 * @param publicUrl - The server's public URL (e.g., "https://api.example.com")
 * @param token - The cleartext machine token
 * @returns Full URL for whitelist download
 */
export function buildWhitelistUrl(publicUrl: string, token: string): string {
  // Ensure no trailing slash on publicUrl
  const baseUrl = publicUrl.replace(/\/+$/, '');
  return `${baseUrl}/w/${token}/whitelist.txt`;
}

export default {
  generateMachineToken,
  hashMachineToken,
  buildWhitelistUrl,
};
