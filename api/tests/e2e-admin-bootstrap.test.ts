import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  provisionTeacherScenario,
  registerTeacherE2ELifecycle,
  resetDb,
} from './e2e-teacher-test-harness.js';

registerTeacherE2ELifecycle();

await describe('E2E teacher workflow bootstrap', { timeout: 75_000 }, async () => {
  beforeEach(async () => {
    await resetDb();
  });

  await test('provisions admin login plus teacher group and assignment', async () => {
    const scenario = await provisionTeacherScenario();

    assert.ok(scenario.adminToken.length > 0);
    assert.ok(scenario.teacherId.length > 0);
    assert.ok(scenario.teacherGroupId.length > 0);
    assert.ok(scenario.teacherToken.length > 0);
    assert.match(scenario.teacherEmail, /pedro-teacher/);
  });
});
