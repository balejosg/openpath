import { getErrorMessage } from '@openpath/shared';

import { logger } from '../lib/logger.js';
import * as roleStorage from '../lib/role-storage.js';
import * as userStorage from '../lib/user-storage.js';

export interface DefaultAdminDeps {
  assignRole: (input: { userId: string; role: 'admin'; groupIds: string[] }) => Promise<unknown>;
  createUser: (
    input: { email: string; name: string; password: string },
    options: { emailVerified: boolean }
  ) => Promise<{ id: string; email: string }>;
  getUserByEmail: (email: string) => Promise<{ id: string; email: string } | null>;
  loggerInstance: Pick<typeof logger, 'error' | 'info'>;
}

const defaultDeps: DefaultAdminDeps = {
  assignRole: roleStorage.assignRole,
  createUser: userStorage.createUser,
  getUserByEmail: userStorage.getUserByEmail,
  loggerInstance: logger,
};

export async function ensureDefaultAdminFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
  deps: DefaultAdminDeps = defaultDeps
): Promise<void> {
  const email = env.ADMIN_EMAIL;
  const password = env.ADMIN_PASSWORD;

  if (email === undefined || email === '' || password === undefined || password === '') {
    return;
  }

  const existingAdmin = await deps.getUserByEmail(email).catch(() => null);
  if (existingAdmin) {
    return;
  }

  deps.loggerInstance.info('Creating default admin user from environment variables...');

  try {
    const admin = await deps.createUser(
      {
        email,
        name: 'System Admin',
        password,
      },
      { emailVerified: true }
    );

    await deps.assignRole({
      userId: admin.id,
      role: 'admin',
      groupIds: [],
    });

    deps.loggerInstance.info(`Default admin user created: ${admin.email}`);
  } catch (error) {
    deps.loggerInstance.error('Failed to create default admin user', {
      error: getErrorMessage(error),
    });
  }
}
