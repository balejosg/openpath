import * as roleStorage from '../lib/role-storage.js';
import * as userStorage from '../lib/user-storage.js';
import * as setupStorage from '../lib/setup-storage.js';
import { withTransaction } from '../db/index.js';
import type {
  CreateFirstAdminInput,
  CreateFirstAdminResult,
  SetupResult,
} from './setup-service-shared.js';

export async function createFirstAdmin(
  input: CreateFirstAdminInput
): Promise<SetupResult<CreateFirstAdminResult>> {
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

  if (await roleStorage.hasAnyAdmins()) {
    return {
      ok: false,
      error: { code: 'SETUP_ALREADY_COMPLETED', message: 'Setup already completed' },
    };
  }

  if (await userStorage.emailExists(input.email)) {
    return {
      ok: false,
      error: { code: 'EMAIL_EXISTS', message: 'Email already registered' },
    };
  }

  const registrationToken = setupStorage.generateRegistrationToken();

  const user = await withTransaction(async (tx) => {
    const createdUser = await userStorage.createUser(input, { emailVerified: true }, tx);

    await roleStorage.assignRole(
      {
        userId: createdUser.id,
        role: 'admin',
        groupIds: [],
        createdBy: createdUser.id,
      },
      tx
    );

    await setupStorage.saveSetupData(
      {
        registrationToken,
        setupCompletedAt: new Date().toISOString(),
        setupByUserId: createdUser.id,
      },
      tx
    );

    return createdUser;
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

export const SetupManagementService = {
  createFirstAdmin,
  regenerateToken,
};

export default SetupManagementService;
