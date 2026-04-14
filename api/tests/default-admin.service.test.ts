import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

process.env.NODE_ENV = 'test';

function createDeps(): {
  calls: string[];
  deps: {
    assignRole: (input: { userId: string; role: 'admin'; groupIds: string[] }) => Promise<unknown>;
    createUser: (
      input: { email: string; name: string; password: string },
      options: { emailVerified: boolean }
    ) => Promise<{ id: string; email: string }>;
    getUserByEmail: (email: string) => Promise<{ id: string; email: string } | null>;
    loggerInstance: {
      error: () => void;
      info: () => void;
    };
  };
} {
  const calls: string[] = [];

  return {
    calls,
    deps: {
      assignRole: ({
        userId,
      }: {
        userId: string;
        role: 'admin';
        groupIds: string[];
      }): Promise<unknown> => {
        calls.push(`assign:${userId}`);
        return Promise.resolve({});
      },
      createUser: ({
        email,
      }: {
        email: string;
        name: string;
        password: string;
      }): Promise<{ id: string; email: string }> => {
        calls.push(`create:${email}`);
        return Promise.resolve({ id: 'user-1', email });
      },
      getUserByEmail: (email: string): Promise<{ id: string; email: string } | null> => {
        calls.push(`lookup:${email}`);
        return Promise.resolve(null);
      },
      loggerInstance: {
        error: (): void => {
          return undefined;
        },
        info: (): void => {
          return undefined;
        },
      },
    },
  };
}

await describe('default admin bootstrap service', async () => {
  const { ensureDefaultAdminFromEnv } = await import('../src/services/default-admin.service.js');

  await test('does nothing when admin env vars are missing', async () => {
    const { calls, deps } = createDeps();

    await ensureDefaultAdminFromEnv({}, deps);

    assert.deepEqual(calls, []);
  });

  await test('creates and assigns admin role when credentials are provided', async () => {
    const { calls, deps } = createDeps();

    await ensureDefaultAdminFromEnv(
      {
        ADMIN_EMAIL: 'admin@test.local',
        ADMIN_PASSWORD: 'Password123!',
      },
      deps
    );

    assert.deepEqual(calls, [
      'lookup:admin@test.local',
      'create:admin@test.local',
      'assign:user-1',
    ]);
  });
});
