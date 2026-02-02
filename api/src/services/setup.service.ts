/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * SetupService - Business logic for initial system setup
 *
 * This service extracts the shared logic from REST endpoints and tRPC routers
 * to eliminate duplication and provide a single source of truth.
 */

import * as roleStorage from '../lib/role-storage.js';
import * as userStorage from '../lib/user-storage.js';
import * as setupStorage from '../lib/setup-storage.js';
import { logger } from '../lib/logger.js';

// =============================================================================
// Types
// =============================================================================

export interface SetupStatus {
  needsSetup: boolean;
  hasAdmin: boolean;
}

export interface CreateFirstAdminInput {
  email: string;
  name: string;
  password: string;
}

export interface CreateFirstAdminResult {
  success: true;
  registrationToken: string;
  user: { id: string; email: string; name: string };
}

export type SetupServiceError =
  | { code: 'SETUP_ALREADY_COMPLETED'; message: string }
  | { code: 'EMAIL_EXISTS'; message: string }
  | { code: 'INVALID_INPUT'; message: string; field: string }
  | { code: 'SETUP_NOT_COMPLETED'; message: string };

export type SetupResult<T> = { ok: true; data: T } | { ok: false; error: SetupServiceError };

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Get the current setup status
 */
export async function getStatus(): Promise<SetupStatus> {
  const hasAdmin = await roleStorage.hasAnyAdmins();
  return {
    needsSetup: !hasAdmin,
    hasAdmin,
  };
}

/**
 * Create the first admin user and initialize the system
 */
export async function createFirstAdmin(
  input: CreateFirstAdminInput
): Promise<SetupResult<CreateFirstAdminResult>> {
  // Validation
  if (!input.email.includes('@')) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'Invalid email address', field: 'email' },
    };
  }
  if (input.name.trim() === '') {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'Name is required', field: 'name' },
    };
  }
  if (input.password.length < 8) {
    return {
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Password must be at least 8 characters',
        field: 'password',
      },
    };
  }

  // Check if setup already completed
  if (await roleStorage.hasAnyAdmins()) {
    return {
      ok: false,
      error: { code: 'SETUP_ALREADY_COMPLETED', message: 'Setup already completed' },
    };
  }

  // Check if email is already taken
  if (await userStorage.emailExists(input.email)) {
    return {
      ok: false,
      error: { code: 'EMAIL_EXISTS', message: 'Email already registered' },
    };
  }

  // Create the user
  const user = await userStorage.createUser(input);

  // Assign admin role
  await roleStorage.assignRole({
    userId: user.id,
    role: 'admin',
    groupIds: [],
    createdBy: user.id,
  });

  // Generate registration token and save setup data
  const registrationToken = setupStorage.generateRegistrationToken();
  await setupStorage.saveSetupData({
    registrationToken,
    setupCompletedAt: new Date().toISOString(),
    setupByUserId: user.id,
  });

  return {
    ok: true,
    data: {
      success: true,
      registrationToken,
      user: { id: user.id, email: user.email, name: user.name },
    },
  };
}

/**
 * Validate a registration token
 */
export async function validateToken(token: string): Promise<{ valid: boolean }> {
  if (token.trim() === '') {
    return { valid: false };
  }
  const isValid = await setupStorage.validateRegistrationToken(token);
  return { valid: isValid };
}

/**
 * Get the current registration token (admin only)
 */
export async function getRegistrationToken(): Promise<SetupResult<{ registrationToken: string }>> {
  const token = await setupStorage.getRegistrationToken();
  if (token === null || token === '') {
    return {
      ok: false,
      error: { code: 'SETUP_NOT_COMPLETED', message: 'Setup not completed' },
    };
  }
  return {
    ok: true,
    data: { registrationToken: token },
  };
}

/**
 * Regenerate the registration token (admin only)
 */
export async function regenerateToken(): Promise<SetupResult<{ registrationToken: string }>> {
  const newToken = await setupStorage.regenerateRegistrationToken();
  if (newToken === null || newToken === '') {
    return {
      ok: false,
      error: { code: 'SETUP_NOT_COMPLETED', message: 'Setup not completed' },
    };
  }
  return {
    ok: true,
    data: { registrationToken: newToken },
  };
}

// =============================================================================
// Default Export
// =============================================================================

logger.debug('SetupService initialized');

export default {
  getStatus,
  createFirstAdmin,
  validateToken,
  getRegistrationToken,
  regenerateToken,
};
