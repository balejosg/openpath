import { after, before, describe, test } from 'node:test';
import assert from 'node:assert';
import { sql } from 'drizzle-orm';

import { closeConnection, db } from '../src/db/index.js';
import * as classroomStorage from '../src/lib/classroom-storage.js';
import * as scheduleStorage from '../src/lib/schedule-storage.js';
import { createMachineExemption } from '../src/lib/exemption-storage.js';
import {
  ensureUserCanAccessClassroom,
  ensureUserCanEnrollClassroom,
} from '../src/services/classroom.service.js';
import { resetDb } from './test-utils.js';
import type { JWTPayload } from '../src/types/index.js';

async function ensureGroupExists(groupId: string): Promise<void> {
  await db.execute(
    sql.raw(`
      INSERT INTO whitelist_groups (id, name, display_name)
      VALUES ('${groupId}', '${groupId}', '${groupId}')
      ON CONFLICT (id) DO NOTHING
    `)
  );
}

function teacherPayload(groupIds: string[]): JWTPayload {
  return {
    sub: 'teacher-user',
    email: 'teacher@example.com',
    name: 'Teacher Example',
    type: 'access',
    roles: [{ role: 'teacher', groupIds }],
  };
}

await describe('classroom effective policy context', async () => {
  before(async () => {
    await resetDb();
  });

  after(async () => {
    await resetDb();
    await closeConnection();
  });

  await test('resolveEffectiveClassroomPolicyContext reports unrestricted none for groupless classrooms', async () => {
    const classroom = await classroomStorage.createClassroom({
      name: `policy-room-none-${Date.now().toString()}`,
      displayName: 'Policy Room None',
    });

    const context = await classroomStorage.resolveEffectiveClassroomPolicyContext(classroom.id);
    assert.ok(context);
    assert.strictEqual(context.mode, 'unrestricted');
    assert.strictEqual(context.reason, 'none');
    assert.strictEqual(context.groupId, null);
    assert.strictEqual(context.classroomId, classroom.id);
    assert.strictEqual(context.classroomName, classroom.name);
  });

  await test('serializePolicyGroupId emits the legacy unrestricted sentinel only at the wire boundary', async () => {
    const { serializePolicyGroupId } = await import('../src/lib/classroom-storage.js');

    assert.strictEqual(
      serializePolicyGroupId({ mode: 'unrestricted', groupId: null }),
      '__unrestricted__'
    );
    assert.strictEqual(
      serializePolicyGroupId({ mode: 'grouped', groupId: 'group-123' }),
      'group-123'
    );
  });

  await test('resolveEffectiveMachineEnforcementPolicyContext preserves grouped base context and flags exemptions as unrestricted', async () => {
    const groupId = `policy-default-group-${Date.now().toString()}`;
    await ensureGroupExists(groupId);

    const classroom = await classroomStorage.createClassroom({
      name: `policy-room-exempt-${Date.now().toString()}`,
      displayName: 'Policy Room Exempt',
      defaultGroupId: groupId,
    });

    const machine = await classroomStorage.registerMachine({
      hostname: `policy-host-${Date.now().toString()}`,
      classroomId: classroom.id,
    });

    const schedule = await scheduleStorage.createSchedule({
      classroomId: classroom.id,
      teacherId: 'legacy_admin',
      groupId,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
    });

    const now = new Date(2026, 1, 23, 9, 15, 0);
    await createMachineExemption({
      machineId: machine.id,
      classroomId: classroom.id,
      scheduleId: schedule.id,
      createdBy: 'legacy_admin',
      now,
    });

    const baseContext = await classroomStorage.resolveEffectiveMachinePolicyContext(
      machine.hostname,
      now
    );
    assert.ok(baseContext);
    assert.strictEqual(baseContext.mode, 'grouped');
    assert.strictEqual(baseContext.reason, 'schedule');
    assert.strictEqual(baseContext.groupId, groupId);

    const enforcementContext =
      await classroomStorage.resolveEffectiveMachineEnforcementPolicyContext(machine.hostname, now);
    assert.ok(enforcementContext);
    assert.strictEqual(enforcementContext.mode, 'unrestricted');
    assert.strictEqual(enforcementContext.reason, 'exemption');
    assert.strictEqual(enforcementContext.groupId, null);
  });

  await test('teachers may enroll groupless classrooms without being allowed to view them', async () => {
    const classroom = await classroomStorage.createClassroom({
      name: `policy-room-enroll-${Date.now().toString()}`,
      displayName: 'Policy Room Enroll',
    });

    const teacher = teacherPayload([]);

    const access = await ensureUserCanAccessClassroom(teacher, classroom.id);
    assert.deepStrictEqual(access, {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You do not have access to this classroom' },
    });

    const enroll = await ensureUserCanEnrollClassroom(teacher, classroom.id);
    if (!enroll.ok) {
      throw new Error('Expected enroll access to succeed');
    }

    assert.strictEqual(enroll.data.currentGroupId, null);
    assert.strictEqual(enroll.data.currentGroupSource, 'none');
  });
});
