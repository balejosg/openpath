import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as classroomStorage from '../src/lib/classroom-storage.js';
import * as scheduleStorage from '../src/lib/schedule-storage.js';
import {
  getCoverageRegressionHarness,
  registerCoverageRegressionLifecycle,
} from './coverage-regressions-test-harness.js';
import { bearerAuth, parseTRPC, trpcMutate } from './test-utils.js';

registerCoverageRegressionLifecycle();

void describe('coverage regressions - router validation branches', () => {
  void it('covers the changed router validation branches', async () => {
    const { accessToken } = await getCoverageRegressionHarness().bootstrapAdminSession({
      name: 'Coverage Admin',
    });

    const invalidRuleResponse = await trpcMutate(
      getCoverageRegressionHarness().apiUrl,
      'groups.createRule',
      {
        groupId: 'group-1',
        type: 'blocked_path',
        value: 'not-a-valid-blocked-path',
      },
      bearerAuth(accessToken)
    );
    assert.strictEqual(invalidRuleResponse.status, 400);
    const invalidRulePayload = await parseTRPC(invalidRuleResponse);
    assert.match(invalidRulePayload.error ?? '', /slash|path/i);

    const invalidBulkResponse = await trpcMutate(
      getCoverageRegressionHarness().apiUrl,
      'groups.bulkCreateRules',
      {
        groupId: 'group-1',
        type: 'blocked_path',
        values: ['still-not-a-valid-blocked-path'],
      },
      bearerAuth(accessToken)
    );
    assert.strictEqual(invalidBulkResponse.status, 400);

    const invalidExemptionResponse = await trpcMutate(
      getCoverageRegressionHarness().apiUrl,
      'classrooms.createExemption',
      {
        machineId: 'machine-1',
        classroomId: 'classroom-1',
        scheduleId: 'not-a-uuid',
      },
      bearerAuth(accessToken)
    );
    assert.strictEqual(invalidExemptionResponse.status, 400);

    const classroom = await classroomStorage.createClassroom({
      name: 'Coverage Router Classroom',
      defaultGroupId: 'default',
    });
    const machine = await classroomStorage.registerMachine({
      hostname: 'coverage-router-machine',
      classroomId: classroom.id,
      version: '1.0.0',
    });
    const startAt = new Date();
    startAt.setMinutes(Math.floor(startAt.getMinutes() / 15) * 15, 0, 0);
    const endAt = new Date(startAt.getTime() + 15 * 60_000);
    const schedule = await scheduleStorage.createOneOffSchedule({
      classroomId: classroom.id,
      teacherId: 'legacy_admin',
      groupId: 'default',
      startAt,
      endAt,
    });

    const createExemptionResponse = await trpcMutate(
      getCoverageRegressionHarness().apiUrl,
      'classrooms.createExemption',
      {
        machineId: machine.id,
        classroomId: classroom.id,
        scheduleId: schedule.id,
      },
      bearerAuth(accessToken)
    );
    assert.strictEqual(createExemptionResponse.status, 200);
    const createdExemption = (await parseTRPC(createExemptionResponse)).data as { id: string };

    const listExemptionsResponse = await fetch(
      `${getCoverageRegressionHarness().apiUrl}/trpc/classrooms.listExemptions?input=${encodeURIComponent(JSON.stringify({ classroomId: classroom.id }))}`,
      { headers: bearerAuth(accessToken) }
    );
    assert.strictEqual(listExemptionsResponse.status, 200);

    const deleteExemptionResponse = await trpcMutate(
      getCoverageRegressionHarness().apiUrl,
      'classrooms.deleteExemption',
      { id: createdExemption.id },
      bearerAuth(accessToken)
    );
    assert.strictEqual(deleteExemptionResponse.status, 200);
  });
});
