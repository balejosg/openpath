import * as roleStorage from '../lib/role-storage.js';
import * as setupStorage from '../lib/setup-storage.js';
import type { SetupResult, SetupStatus } from './setup-service-shared.js';

export async function getStatus(): Promise<SetupStatus> {
  const hasAdmin = await roleStorage.hasAnyAdmins();
  return {
    needsSetup: !hasAdmin,
    hasAdmin,
  };
}

export async function validateToken(token: string): Promise<{ valid: boolean }> {
  if (token.trim() === '') {
    return { valid: false };
  }

  const isValid = await setupStorage.validateRegistrationToken(token);
  return { valid: isValid };
}

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

export const SetupQueryService = {
  getStatus,
  validateToken,
  getRegistrationToken,
};

export default SetupQueryService;
