import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resetDb, TEST_RUN_ID } from './test-utils.js';
import { createScheduleBoundaryTicker } from '../src/lib/schedule-boundary-ticker.js';
import * as classroomStorage from '../src/lib/classroom-storage.js';
import * as scheduleStorage from '../src/lib/schedule-storage.js';

await describe('Schedule Boundary Ticker', async () => {
  beforeEach(async () => {
    await resetDb();
  });

  await test('runTickOnce emits classroom IDs with boundary at HH:MM', async () => {
    const classroom = await classroomStorage.createClassroom({
      name: `ticker-room-${TEST_RUN_ID}`,
      displayName: 'Ticker Room',
    });

    await scheduleStorage.createSchedule({
      classroomId: classroom.id,
      teacherId: 'legacy_admin',
      groupId: 'schedule-group',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
    });

    const events: { classroomId: string; now: Date }[] = [];
    const ticker = createScheduleBoundaryTicker({
      emitClassroomChanged: (classroomId: string, now: Date) => {
        events.push({ classroomId, now });
      },
    });

    const boundaryNow = new Date(2026, 1, 23, 9, 0, 0); // Monday 09:00 local
    await ticker.runTickOnce(boundaryNow);

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0]?.classroomId, classroom.id);
  });
});
