import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  parseTRPC,
  provisionTeacherScenario,
  registerTeacherE2ELifecycle,
  resetDb,
  trpcQuery,
} from './e2e-teacher-test-harness.js';

registerTeacherE2ELifecycle();

await describe('E2E teacher profile flow', { timeout: 75_000 }, async () => {
  beforeEach(async () => {
    await resetDb();
  });

  await test('teacher can log in and fetch a profile with role info', async () => {
    const scenario = await provisionTeacherScenario();

    const response = await trpcQuery('auth.me', undefined, {
      Authorization: `Bearer ${scenario.teacherToken}`,
    });

    assert.equal(response.status, 200);
    const res = await parseTRPC(response);
    const data = res.data as { user: { email: string } };
    assert.equal(data.user.email, scenario.teacherEmail);
  });
});
