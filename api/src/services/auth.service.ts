/**
 * AuthService - Business logic for authentication
 */

import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import * as userStorage from '../lib/user-storage.js';
import * as roleStorage from '../lib/role-storage.js';
import * as auth from '../lib/auth.js';
import * as resetTokenStorage from '../lib/reset-token-storage.js';
import * as emailVerificationTokenStorage from '../lib/email-verification-token-storage.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';
import type { AuthUser, LoginResponse, RoleInfo } from '../types/index.js';
import type { CreateUserData } from '../types/storage.js';
import { getErrorMessage } from '@openpath/shared';
import { normalizeUserRoleString } from '@openpath/shared/roles';

const googleClient = new OAuth2Client();

// =============================================================================
// Types
// =============================================================================

export type AuthServiceError =
  | { code: 'CONFLICT'; message: string }
  | { code: 'UNAUTHORIZED'; message: string }
  | { code: 'FORBIDDEN'; message: string }
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'BAD_REQUEST'; message: string };

export type AuthResult<T> = { ok: true; data: T } | { ok: false; error: AuthServiceError };

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  tokenType: 'Bearer';
}

export interface RegisterResponse {
  user: AuthUser;
  verificationRequired: true;
  verificationToken: string;
  verificationExpiresAt: string;
}

export interface EmailVerificationTokenResponse {
  email: string;
  verificationRequired: true;
  verificationToken: string;
  verificationExpiresAt: string;
}

export const EMAIL_VERIFICATION_REQUIRED_MESSAGE = 'Email verification required before signing in';

function parseDurationToSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const milliseconds = Number.parseFloat(trimmed);
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      return null;
    }
    return Math.floor(milliseconds / 1000);
  }

  const match =
    /^(\d+(?:\.\d+)?)\s*(ms|msecs?|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|weeks?|y|yrs?|years?)$/i.exec(
      trimmed
    );
  if (!match) {
    return null;
  }

  const [, amountText, unitText] = match;
  if (!amountText || !unitText) {
    return null;
  }

  const amount = Number.parseFloat(amountText);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  const unit = unitText.toLowerCase();
  const unitToSeconds: Record<string, number> = {
    ms: 1 / 1000,
    msec: 1 / 1000,
    msecs: 1 / 1000,
    millisecond: 1 / 1000,
    milliseconds: 1 / 1000,
    s: 1,
    sec: 1,
    secs: 1,
    second: 1,
    seconds: 1,
    m: 60,
    min: 60,
    mins: 60,
    minute: 60,
    minutes: 60,
    h: 60 * 60,
    hr: 60 * 60,
    hrs: 60 * 60,
    hour: 60 * 60,
    hours: 60 * 60,
    d: 24 * 60 * 60,
    day: 24 * 60 * 60,
    days: 24 * 60 * 60,
    w: 7 * 24 * 60 * 60,
    week: 7 * 24 * 60 * 60,
    weeks: 7 * 24 * 60 * 60,
    y: 365.25 * 24 * 60 * 60,
    yr: 365.25 * 24 * 60 * 60,
    yrs: 365.25 * 24 * 60 * 60,
    year: 365.25 * 24 * 60 * 60,
    years: 365.25 * 24 * 60 * 60,
  };
  const secondsPerUnit = unitToSeconds[unit];
  if (secondsPerUnit === undefined) {
    return null;
  }

  return Math.floor(amount * secondsPerUnit);
}

function getAccessTokenLifetimeSeconds(accessToken: string): number | null {
  const decoded = jwt.decode(accessToken);
  if (decoded === null || typeof decoded !== 'object') {
    return null;
  }

  const exp = 'exp' in decoded && typeof decoded.exp === 'number' ? decoded.exp : null;
  const iat = 'iat' in decoded && typeof decoded.iat === 'number' ? decoded.iat : null;
  if (exp === null || iat === null) {
    return null;
  }

  const lifetime = exp - iat;
  return Number.isFinite(lifetime) && lifetime >= 0 ? lifetime : null;
}

function currentSessionTransport(): LoginResponse['sessionTransport'] {
  return process.env.OPENPATH_ACCESS_TOKEN_COOKIE_NAME ? 'cookie' : 'token';
}

function buildAuthUser(
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified?: boolean | undefined;
  },
  roleInfo: RoleInfo[]
): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified ?? false,
    roles: roleInfo,
  };
}

function buildLoginResponse(
  tokens: TokenPair,
  user: { id: string; email: string; name: string },
  roleInfo: RoleInfo[]
): LoginResponse {
  const expiresIn =
    getAccessTokenLifetimeSeconds(tokens.accessToken) ??
    parseDurationToSeconds(tokens.expiresIn) ??
    86400;

  return {
    ...tokens,
    expiresIn,
    sessionTransport: currentSessionTransport(),
    user: buildAuthUser(user, roleInfo),
  };
}

async function issueEmailVerificationToken(user: {
  id: string;
  email: string;
}): Promise<EmailVerificationTokenResponse> {
  const { token, expiresAt } = await emailVerificationTokenStorage.createEmailVerificationToken(
    user.id
  );

  return {
    email: user.email,
    verificationRequired: true,
    verificationToken: token,
    verificationExpiresAt: expiresAt.toISOString(),
  };
}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Register a new user
 */
export async function register(input: CreateUserData): Promise<AuthResult<RegisterResponse>> {
  try {
    if (await userStorage.emailExists(input.email)) {
      return {
        ok: false,
        error: { code: 'CONFLICT', message: 'Email already registered' },
      };
    }

    const user = await userStorage.createUser(input, { emailVerified: false });

    const roles = await roleStorage.getUserRoles(user.id);
    const roleInfo: RoleInfo[] = roles
      .map((r) => {
        const role = normalizeUserRoleString(r.role);
        if (!role) return null;
        return { role, groupIds: r.groupIds ?? [] };
      })
      .filter((r): r is RoleInfo => r !== null);

    const verification = await issueEmailVerificationToken(user);

    return {
      ok: true,
      data: {
        user: buildAuthUser(user, roleInfo),
        verificationRequired: true,
        verificationToken: verification.verificationToken,
        verificationExpiresAt: verification.verificationExpiresAt,
      },
    };
  } catch (error) {
    logger.error('auth.register error', { error: getErrorMessage(error) });
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) },
    };
  }
}

/**
 * Login user and return tokens
 */
export async function login(email: string, password: string): Promise<AuthResult<LoginResponse>> {
  try {
    const user = await userStorage.verifyPasswordByEmail(email, password);
    if (!user) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } };
    }
    if (!user.isActive) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Account inactive' } };
    }
    if (!user.emailVerified) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: EMAIL_VERIFICATION_REQUIRED_MESSAGE },
      };
    }

    const roles = await roleStorage.getUserRoles(user.id);
    const roleInfo: RoleInfo[] = roles
      .map((r) => {
        const role = normalizeUserRoleString(r.role);
        if (!role) return null;
        return { role, groupIds: r.groupIds ?? [] };
      })
      .filter((r): r is RoleInfo => r !== null);

    const tokens = auth.generateTokens(user, roleInfo);
    return { ok: true, data: buildLoginResponse(tokens, user, roleInfo) };
  } catch (error) {
    logger.error('auth.login error', { error: getErrorMessage(error) });
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) },
    };
  }
}

/**
 * Refresh access token
 */
export async function refresh(refreshToken: string): Promise<AuthResult<TokenPair>> {
  const decoded = await auth.verifyRefreshToken(refreshToken);
  if (!decoded) {
    return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } };
  }

  const user = await userStorage.getUserById(decoded.sub);
  if (user?.isActive !== true || user.emailVerified !== true) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message:
          user?.emailVerified === false
            ? EMAIL_VERIFICATION_REQUIRED_MESSAGE
            : 'User not found or inactive',
      },
    };
  }

  await auth.blacklistToken(refreshToken);
  const roles = await roleStorage.getUserRoles(user.id);
  const roleInfo: RoleInfo[] = roles
    .map((r) => {
      const role = normalizeUserRoleString(r.role);
      if (!role) return null;
      return { role, groupIds: r.groupIds ?? [] };
    })
    .filter((r): r is RoleInfo => r !== null);

  const tokens = auth.generateTokens(user, roleInfo);

  return { ok: true, data: tokens as TokenPair };
}

/**
 * Logout user
 */
export async function logout(
  accessToken?: string,
  refreshToken?: string
): Promise<AuthResult<{ success: boolean }>> {
  if (accessToken) await auth.blacklistToken(accessToken);
  if (refreshToken) await auth.blacklistToken(refreshToken);
  return { ok: true, data: { success: true } };
}

/**
 * Get user profile
 */
export async function getProfile(userId: string): Promise<AuthResult<{ user: AuthUser }>> {
  const user = await userStorage.getUserById(userId);
  if (!user) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
  }

  const roles = await roleStorage.getUserRoles(user.id);
  const roleInfo: RoleInfo[] = roles
    .map((r) => {
      const role = normalizeUserRoleString(r.role);
      if (!role) return null;
      return { role, groupIds: r.groupIds ?? [] };
    })
    .filter((r): r is RoleInfo => r !== null);

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified ?? false,
    roles: roleInfo,
  };

  return { ok: true, data: { user: authUser } };
}

export async function generateEmailVerificationToken(
  email: string
): Promise<AuthResult<EmailVerificationTokenResponse>> {
  try {
    const user = await userStorage.getUserByEmail(email);
    if (!user) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
    }

    if (user.emailVerified) {
      return {
        ok: false,
        error: { code: 'CONFLICT', message: 'Email is already verified' },
      };
    }

    return {
      ok: true,
      data: await issueEmailVerificationToken(user),
    };
  } catch (error) {
    logger.error('auth.generateEmailVerificationToken error', {
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) },
    };
  }
}

export async function verifyEmail(
  email: string,
  token: string
): Promise<AuthResult<{ success: boolean }>> {
  try {
    const user = await userStorage.getUserByEmail(email);
    if (!user) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
    }

    if (user.emailVerified) {
      return { ok: true, data: { success: true } };
    }

    const isValid = await emailVerificationTokenStorage.verifyEmailVerificationToken(
      user.id,
      token
    );
    if (!isValid) {
      return {
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid or expired verification token' },
      };
    }

    await userStorage.verifyEmail(user.id);
    return { ok: true, data: { success: true } };
  } catch (error) {
    logger.error('auth.verifyEmail error', { error: getErrorMessage(error) });
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) },
    };
  }
}

/**
 * Generate a password reset token for a user (Admin only)
 */
export async function generateResetToken(email: string): Promise<AuthResult<{ token: string }>> {
  try {
    const user = await userStorage.getUserByEmail(email);
    if (!user) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
    }

    const token = await resetTokenStorage.createResetToken(user.id);
    return { ok: true, data: { token } };
  } catch (error) {
    logger.error('auth.generateResetToken error', { error: getErrorMessage(error) });
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) },
    };
  }
}

/**
 * Reset password using a valid token
 */
export async function resetPassword(
  email: string,
  token: string,
  newPassword: string
): Promise<AuthResult<{ success: boolean }>> {
  try {
    const user = await userStorage.getUserByEmail(email);
    if (!user) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
    }

    const isValid = await resetTokenStorage.verifyToken(user.id, token);
    if (!isValid) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } };
    }

    await userStorage.updateUser(user.id, { password: newPassword });
    return { ok: true, data: { success: true } };
  } catch (error) {
    logger.error('auth.resetPassword error', { error: getErrorMessage(error) });
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) },
    };
  }
}

/**
 * Change password for an authenticated user.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<AuthResult<{ success: boolean }>> {
  try {
    if (!currentPassword || !newPassword) {
      return {
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Current and new password are required' },
      };
    }

    if (newPassword.length < 8) {
      return {
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'New password must be at least 8 characters' },
      };
    }

    const user = await userStorage.getUserById(userId);
    if (!user) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
    }

    const isValidCurrentPassword = await userStorage.verifyPassword(user, currentPassword);
    if (!isValidCurrentPassword) {
      return {
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Current password is incorrect' },
      };
    }

    await userStorage.updateUser(user.id, { password: newPassword });
    return { ok: true, data: { success: true } };
  } catch (error) {
    logger.error('auth.changePassword error', { error: getErrorMessage(error) });
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) },
    };
  }
}

// =============================================================================
// Default Export
// =============================================================================

const GOOGLE_VERIFY_TIMEOUT_MS = 15000;

async function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function loginWithGoogle(idToken: string): Promise<AuthResult<LoginResponse>> {
  const startTime = Date.now();
  logger.info('auth.loginWithGoogle started');

  try {
    if (!config.googleClientId) {
      logger.warn('auth.loginWithGoogle: Google OAuth not configured');
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Google OAuth not configured' } };
    }

    logger.info('auth.loginWithGoogle: verifying token with Google API...');
    const ticket = await withTimeout(
      googleClient.verifyIdToken({
        idToken,
        audience: config.googleClientId,
      }),
      GOOGLE_VERIFY_TIMEOUT_MS,
      `Google token verification timed out after ${String(GOOGLE_VERIFY_TIMEOUT_MS)}ms`
    );
    logger.info('auth.loginWithGoogle: token verified', { elapsed: Date.now() - startTime });

    const payload = ticket.getPayload();

    if (!payload?.email || !payload.sub) {
      logger.warn('auth.loginWithGoogle: invalid token payload', {
        hasEmail: !!payload?.email,
        hasSub: !!payload?.sub,
      });
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid Google token' } };
    }

    logger.info('auth.loginWithGoogle: looking up user', {
      email: payload.email,
      googleId: payload.sub.slice(0, 8) + '...',
    });
    let user = await userStorage.getUserByGoogleId(payload.sub);
    logger.info('auth.loginWithGoogle: getUserByGoogleId complete', {
      found: !!user,
      elapsed: Date.now() - startTime,
    });

    if (!user) {
      logger.info('auth.loginWithGoogle: user not found by googleId, checking email');
      user = await userStorage.getUserByEmail(payload.email);
      if (user) {
        logger.info('auth.loginWithGoogle: found user by email, linking googleId');
        await userStorage.linkGoogleId(user.id, payload.sub);
        if (!user.emailVerified) {
          await userStorage.verifyEmail(user.id);
        }
        user = await userStorage.getUserById(user.id);
      } else {
        logger.warn('auth.loginWithGoogle: rejected unknown Google account', {
          email: payload.email,
          elapsed: Date.now() - startTime,
        });
        return {
          ok: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Google sign-in is only available for existing or preapproved accounts',
          },
        };
      }
    }

    if (!user) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Failed to create or find user' },
      };
    }

    if (!user.isActive) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Account inactive' } };
    }

    const roles = await roleStorage.getUserRoles(user.id);
    const roleInfo: RoleInfo[] = roles
      .map((r) => {
        const role = normalizeUserRoleString(r.role);
        if (!role) return null;
        return { role, groupIds: r.groupIds ?? [] };
      })
      .filter((r): r is RoleInfo => r !== null);

    const tokens = auth.generateTokens(user, roleInfo);
    return { ok: true, data: buildLoginResponse(tokens, user, roleInfo) };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const elapsed = Date.now() - startTime;
    logger.error('auth.loginWithGoogle error', { error: errorMessage, elapsed });

    // Provide more specific error message for timeouts
    if (errorMessage.includes('timed out')) {
      return {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Google verification timed out. Please try again.',
        },
      };
    }

    return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Google authentication failed' } };
  }
}

export default {
  register,
  login,
  loginWithGoogle,
  refresh,
  logout,
  getProfile,
  generateEmailVerificationToken,
  verifyEmail,
  generateResetToken,
  resetPassword,
  changePassword,
};
