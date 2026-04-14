import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  provisionTeacherScenario,
  registerTeacherE2ELifecycle,
  resetDb,
  trpcMutate,
  trpcQuery,
} from './e2e-teacher-test-harness.js';

registerTeacherE2ELifecycle();

await describe('E2E teacher admin boundaries', { timeout: 75_000 }, async () => {
  beforeEach(async () => {
    await resetDb();
  });

  await test('teacher cannot access admin-only user management procedures', async () => {
    const scenario = await provisionTeacherScenario();
    const authHeader = { Authorization: `Bearer ${scenario.teacherToken}` };

    const listUsers = await trpcQuery('users.list', undefined, authHeader);
    assert.ok([401, 403].includes(listUsers.status));

    const createUser = await trpcMutate(
      'users.create',
      {
        email: `unauth-${Date.now().toString()}@test.com`,
        password: 'Password123!',
        name: 'Unauthorized User',
      },
      authHeader
    );
    assert.ok([401, 403].includes(createUser.status));

    const assignRole = await trpcMutate(
      'users.assignRole',
      {
        userId: 'some-id',
        role: 'admin',
        groupIds: [],
      },
      authHeader
    );
    assert.ok([401, 403].includes(assignRole.status));
  });

  await test('teacher can still logout cleanly after the workflow', async () => {
    const scenario = await provisionTeacherScenario();

    const response = await trpcMutate(
      'auth.logout',
      {},
      {
        Authorization: `Bearer ${scenario.teacherToken}`,
      }
    );

    assert.equal(response.status, 200);
  });
});
