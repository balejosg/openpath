import crypto from 'node:crypto';

import jwt, { type SignOptions } from 'jsonwebtoken';

import { getJwtAccessExpiry, getJwtRefreshExpiry, getJwtSecret } from './auth-config.js';
import type { RoleInfo, User, JWTPayload } from '../types/index.js';

export interface TokensResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  tokenType: 'Bearer';
}

export function generateAccessToken(user: User, roles: RoleInfo[] = []): string {
  const payload: JWTPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    roles: roles.map((role) => ({
      role: role.role,
      groupIds: role.groupIds,
    })),
    type: 'access',
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: getJwtAccessExpiry(),
    issuer: 'openpath-api',
    jwtid: crypto.randomUUID(),
  } as SignOptions);
}

export function generateRefreshToken(user: User): string {
  return jwt.sign(
    {
      sub: user.id,
      type: 'refresh',
    },
    getJwtSecret(),
    {
      expiresIn: getJwtRefreshExpiry(),
      issuer: 'openpath-api',
      jwtid: crypto.randomUUID(),
    } as SignOptions
  );
}

export function generateTokens(user: User, roles: RoleInfo[] = []): TokensResult {
  return {
    accessToken: generateAccessToken(user, roles),
    refreshToken: generateRefreshToken(user),
    expiresIn: getJwtAccessExpiry(),
    tokenType: 'Bearer',
  };
}
