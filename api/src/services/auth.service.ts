/**
 * AuthService - Business logic for authentication
 */

import { OAuth2Client } from 'google-auth-library';
import * as userStorage from '../lib/user-storage.js';
import * as roleStorage from '../lib/role-storage.js';
import * as auth from '../lib/auth.js';
import * as resetTokenStorage from '../lib/reset-token-storage.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';
import type {
    SafeUser,
    LoginResponse,
    UserRole
} from '../types/index.js';
import type { CreateUserData } from '../types/storage.js';
import { getErrorMessage } from '@openpath/shared';

const googleClient = new OAuth2Client();

// =============================================================================
// Types
// =============================================================================

export type AuthServiceError =
    | { code: 'CONFLICT'; message: string }
    | { code: 'UNAUTHORIZED'; message: string }
    | { code: 'FORBIDDEN'; message: string }
    | { code: 'NOT_FOUND'; message: string };

export type AuthResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: AuthServiceError };

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
    tokenType: 'Bearer';
}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Register a new user
 */
export async function register(
    input: CreateUserData
): Promise<AuthResult<{ user: SafeUser }>> {
    try {
        if (await userStorage.emailExists(input.email)) {
            return {
                ok: false,
                error: { code: 'CONFLICT', message: 'Email already registered' }
            };
        }
        
        // Check if this is the first user (no admins exist)
        const isFirstUser = !(await roleStorage.hasAnyAdmins());
        
        const user = await userStorage.createUser(input);
        
        // Auto-assign admin role to first user
        if (isFirstUser) {
            await roleStorage.assignRole({
                userId: user.id,
                role: 'admin',
                groupIds: [],
                createdBy: user.id,
            });
            logger.info('First user auto-assigned admin role via registration', { userId: user.id, email: user.email });
        }
        
        return { ok: true, data: { user: { id: user.id, email: user.email, name: user.name } as SafeUser } };
    } catch (error) {
        logger.error('auth.register error', { error: getErrorMessage(error) });
        return {
            ok: false,
            error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) }
        };
    }
}

/**
 * Login user and return tokens
 */
export async function login(
    email: string,
    password: string
): Promise<AuthResult<LoginResponse>> {
    try {
        const user = await userStorage.verifyPasswordByEmail(email, password);
        if (!user) {
            return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } };
        }
        if (!user.isActive) {
            return { ok: false, error: { code: 'FORBIDDEN', message: 'Account inactive' } };
        }

        const roles = await roleStorage.getUserRoles(user.id);
        const tokens = auth.generateTokens(user, roles.map(r => ({
            role: r.role as 'admin' | 'teacher' | 'student',
            groupIds: r.groupIds ?? []
        })));

        return {
            ok: true,
            data: {
                ...tokens,
                expiresIn: parseInt(tokens.expiresIn) || 86400, // Standardize to number
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    roles: roles.map(r => ({
                        id: r.id,
                        userId: r.userId,
                        role: r.role as UserRole,
                        groupIds: r.groupIds ?? [],
                        createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
                        updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
                        createdBy: r.createdBy,
                        revokedAt: null
                    }))
                } as unknown as SafeUser
            }
        };
    } catch (error) {
        logger.error('auth.login error', { error: getErrorMessage(error) });
        return {
            ok: false,
            error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) }
        };
    }
}

/**
 * Refresh access token
 */
export async function refresh(
    refreshToken: string
): Promise<AuthResult<TokenPair>> {
    const decoded = await auth.verifyRefreshToken(refreshToken);
    if (!decoded) {
        return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } };
    }

    const user = await userStorage.getUserById(decoded.sub);
    if (user?.isActive !== true) {
        return { ok: false, error: { code: 'UNAUTHORIZED', message: 'User not found or inactive' } };
    }

    await auth.blacklistToken(refreshToken);
    const roles = await roleStorage.getUserRoles(user.id);
    const tokens = auth.generateTokens(user, roles.map(r => ({
        role: r.role as 'admin' | 'teacher' | 'student',
        groupIds: r.groupIds ?? []
    })));

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
export async function getProfile(
    userId: string
): Promise<AuthResult<{ user: SafeUser }>> {
    const user = await userStorage.getUserById(userId);
    if (!user) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } };
    }

    const roles = await roleStorage.getUserRoles(user.id);
    return {
        ok: true,
        data: {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                roles: roles.map(r => ({
                    id: r.id,
                    userId: r.userId,
                    role: r.role as UserRole,
                    groupIds: r.groupIds ?? [],
                    createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
                    updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
                    createdBy: r.createdBy,
                    revokedAt: null
                }))
            } as unknown as SafeUser
        }
    };
}

/**
 * Generate a password reset token for a user (Admin only)
 */
export async function generateResetToken(
    email: string
): Promise<AuthResult<{ token: string }>> {
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
            error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) }
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
            error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) }
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
        timeoutId = setTimeout(() => { reject(new Error(errorMessage)); }, ms);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
    }
}

export async function loginWithGoogle(
    idToken: string
): Promise<AuthResult<LoginResponse>> {
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
            logger.warn('auth.loginWithGoogle: invalid token payload', { hasEmail: !!payload?.email, hasSub: !!payload?.sub });
            return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid Google token' } };
        }

        logger.info('auth.loginWithGoogle: looking up user', { email: payload.email, googleId: payload.sub.slice(0, 8) + '...' });
        let user = await userStorage.getUserByGoogleId(payload.sub);
        logger.info('auth.loginWithGoogle: getUserByGoogleId complete', { found: !!user, elapsed: Date.now() - startTime });

        if (!user) {
            logger.info('auth.loginWithGoogle: user not found by googleId, checking email');
            user = await userStorage.getUserByEmail(payload.email);
            if (user) {
                logger.info('auth.loginWithGoogle: found user by email, linking googleId');
                await userStorage.linkGoogleId(user.id, payload.sub);
                user = await userStorage.getUserById(user.id);
            } else {
                logger.info('auth.loginWithGoogle: creating new user');
                // Check if this is the first user (no admins exist)
                const isFirstUser = !(await roleStorage.hasAnyAdmins());

                const newUser = await userStorage.createGoogleUser({
                    email: payload.email,
                    name: payload.name ?? payload.email,
                    googleId: payload.sub,
                });
                user = await userStorage.getUserById(newUser.id);
                logger.info('auth.loginWithGoogle: new user created', { userId: user?.id, elapsed: Date.now() - startTime });

                // Auto-assign admin role to first user
                if (isFirstUser && user) {
                    await roleStorage.assignRole({
                        userId: user.id,
                        role: 'admin',
                        groupIds: [],
                        createdBy: user.id,
                    });
                    logger.info('First user auto-assigned admin role via Google OAuth', { userId: user.id, email: user.email });
                }
            }
        }

        if (!user) {
            return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Failed to create or find user' } };
        }

        if (!user.isActive) {
            return { ok: false, error: { code: 'FORBIDDEN', message: 'Account inactive' } };
        }

        const roles = await roleStorage.getUserRoles(user.id);
        const tokens = auth.generateTokens(user, roles.map(r => ({
            role: r.role as 'admin' | 'teacher' | 'student',
            groupIds: r.groupIds ?? []
        })));

        return {
            ok: true,
            data: {
                ...tokens,
                expiresIn: parseInt(tokens.expiresIn) || 86400,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    roles: roles.map(r => ({
                        id: r.id,
                        userId: r.userId,
                        role: r.role as UserRole,
                        groupIds: r.groupIds ?? [],
                        createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
                        updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
                        createdBy: r.createdBy,
                        revokedAt: null
                    }))
                } as unknown as SafeUser
            }
        };
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        const elapsed = Date.now() - startTime;
        logger.error('auth.loginWithGoogle error', { error: errorMessage, elapsed });

        // Provide more specific error message for timeouts
        if (errorMessage.includes('timed out')) {
            return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Google verification timed out. Please try again.' } };
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
    generateResetToken,
    resetPassword
};
