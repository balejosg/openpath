/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Tests for Schedule Storage and API
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { db } from '../src/db/index.js';
import {
  users,
  classrooms,
  schedules,
  machines,
  roles,
  tokens,
  pushSubscriptions,
} from '../src/db/schema.js';
import * as scheduleStorage from '../src/lib/schedule-storage.js';

// Test data
const testClassroomId = 'test-classroom-1';
const testTeacherId = 'teacher-1';
const testGroupId = 'group-math-3eso';

await describe('Schedule Storage', async () => {
  before(async () => {
    // Clean up database (respect FK constraints by deleting dependents first)
    await db.delete(tokens);
    await db.delete(pushSubscriptions);
    await db.delete(schedules);
    await db.delete(machines);
    await db.delete(roles);
    await db.delete(classrooms);
    await db.delete(users);

    // Create dependencies
    await db.insert(users).values({
      id: testTeacherId,
      email: 'teacher@test.com',
      name: 'Test Teacher',
      passwordHash: 'hash',
    });

    await db.insert(classrooms).values({
      id: testClassroomId,
      name: 'test-classroom',
      displayName: 'Test Classroom',
      defaultGroupId: 'default-group',
    });
  });

  beforeEach(async () => {
    await db.delete(schedules);
  });

  after(async () => {
    await db.delete(tokens);
    await db.delete(pushSubscriptions);
    await db.delete(schedules);
    await db.delete(machines);
    await db.delete(roles);
    await db.delete(classrooms);
    await db.delete(users);
  });

  await describe('Time Utilities', async () => {
    await it('should convert time string to minutes', () => {
      assert.strictEqual(scheduleStorage.timeToMinutes('00:00'), 0);
      assert.strictEqual(scheduleStorage.timeToMinutes('01:00'), 60);
      assert.strictEqual(scheduleStorage.timeToMinutes('08:30'), 510);
      assert.strictEqual(scheduleStorage.timeToMinutes('23:59'), 1439);
    });

    await it('should detect overlapping time ranges', () => {
      assert.strictEqual(scheduleStorage.timesOverlap('08:00', '09:00', '09:00', '10:00'), false);
      assert.strictEqual(scheduleStorage.timesOverlap('08:00', '09:00', '10:00', '11:00'), false);
      assert.strictEqual(scheduleStorage.timesOverlap('08:00', '09:00', '08:30', '09:30'), true);
      assert.strictEqual(scheduleStorage.timesOverlap('08:00', '10:00', '09:00', '09:30'), true);
      assert.strictEqual(scheduleStorage.timesOverlap('08:00', '09:00', '08:00', '09:00'), true);
    });
  });

  await describe('CRUD Operations', async () => {
    await it('should create a schedule', async () => {
      const schedule = await scheduleStorage.createSchedule({
        classroomId: testClassroomId,
        teacherId: testTeacherId,
        groupId: testGroupId,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '09:00',
      });

      assert.ok(schedule.id !== '');
      assert.strictEqual(schedule.classroomId, testClassroomId);
      assert.strictEqual(schedule.teacherId, testTeacherId);
      assert.strictEqual(schedule.recurrence, 'weekly');
    });

    await it('should reject invalid day of week', async () => {
      await assert.rejects(async () => {
        await scheduleStorage.createSchedule({
          classroomId: testClassroomId,
          teacherId: testTeacherId,
          groupId: testGroupId,
          dayOfWeek: 6,
          startTime: '08:00',
          endTime: '09:00',
        });
      }, /dayOfWeek must be between 1.*and 5/);
    });

    await it('should reject invalid time format', async () => {
      await assert.rejects(async () => {
        await scheduleStorage.createSchedule({
          classroomId: testClassroomId,
          teacherId: testTeacherId,
          groupId: testGroupId,
          dayOfWeek: 1,
          startTime: '8:00',
          endTime: '09:00',
        });
      }, /Invalid time format/);
    });

    await it('should reject times not in 15-minute increments', async () => {
      await assert.rejects(async () => {
        await scheduleStorage.createSchedule({
          classroomId: testClassroomId,
          teacherId: testTeacherId,
          groupId: testGroupId,
          dayOfWeek: 1,
          startTime: '08:10',
          endTime: '09:00',
        });
      }, /15-minute increments/);
    });

    await it('should reject startTime >= endTime', async () => {
      await assert.rejects(async () => {
        await scheduleStorage.createSchedule({
          classroomId: testClassroomId,
          teacherId: testTeacherId,
          groupId: testGroupId,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '08:00',
        });
      }, /startTime must be before endTime/);
    });

    await it('should detect conflicts', async () => {
      await scheduleStorage.createSchedule({
        classroomId: testClassroomId,
        teacherId: testTeacherId,
        groupId: testGroupId,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '09:00',
      });

      await assert.rejects(async () => {
        await scheduleStorage.createSchedule({
          classroomId: testClassroomId,
          teacherId: testTeacherId, // Reusing same teacher/classroom for conflict
          groupId: 'group-other',
          dayOfWeek: 1,
          startTime: '08:30',
          endTime: '09:30',
        });
      }, /Schedule conflict/);
    });

    await it('should allow non-overlapping schedules', async () => {
      await scheduleStorage.createSchedule({
        classroomId: testClassroomId,
        teacherId: testTeacherId,
        groupId: testGroupId,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '09:00',
      });

      const schedule2 = await scheduleStorage.createSchedule({
        classroomId: testClassroomId,
        teacherId: testTeacherId,
        groupId: 'group-other',
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '10:00',
      });

      assert.ok(schedule2.id !== '');
    });

    await it('should update a schedule', async () => {
      const schedule = await scheduleStorage.createSchedule({
        classroomId: testClassroomId,
        teacherId: testTeacherId,
        groupId: testGroupId,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '09:00',
      });

      const updated = await scheduleStorage.updateSchedule(schedule.id, {
        startTime: '08:30',
        endTime: '09:30',
      });

      assert.ok(updated);
      assert.strictEqual(updated.startTime, '08:30:00'); // DB might return seconds
      assert.strictEqual(updated.endTime, '09:30:00');
    });

    await it('should delete a schedule', async () => {
      const schedule = await scheduleStorage.createSchedule({
        classroomId: testClassroomId,
        teacherId: testTeacherId,
        groupId: testGroupId,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '09:00',
      });

      const deleted = await scheduleStorage.deleteSchedule(schedule.id);
      assert.strictEqual(deleted, true);

      const retrieved = await scheduleStorage.getScheduleById(schedule.id);
      assert.strictEqual(retrieved, null);
    });

    await it('should reject update with weekend dayOfWeek', async () => {
      const schedule = await scheduleStorage.createSchedule({
        classroomId: testClassroomId,
        teacherId: testTeacherId,
        groupId: testGroupId,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '09:00',
      });

      await assert.rejects(async () => {
        await scheduleStorage.updateSchedule(schedule.id, {
          dayOfWeek: 6,
        });
      }, /dayOfWeek must be between 1.*and 5/);
    });

    await it('should reject update with non-15-minute times', async () => {
      const schedule = await scheduleStorage.createSchedule({
        classroomId: testClassroomId,
        teacherId: testTeacherId,
        groupId: testGroupId,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '09:00',
      });

      await assert.rejects(async () => {
        await scheduleStorage.updateSchedule(schedule.id, {
          startTime: '08:05',
          endTime: '09:00',
        });
      }, /15-minute increments/);
    });
  });

  await describe('Query Operations', async () => {
    beforeEach(async () => {
      await scheduleStorage.createSchedule({
        classroomId: testClassroomId,
        teacherId: testTeacherId,
        groupId: testGroupId,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '09:00',
      });
      await scheduleStorage.createSchedule({
        classroomId: testClassroomId,
        teacherId: testTeacherId,
        groupId: 'group-other',
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '10:00',
      });
    });

    await it('should get schedules by classroom', async () => {
      const schedules = await scheduleStorage.getSchedulesByClassroom(testClassroomId);
      assert.strictEqual(schedules.length, 2);
    });

    await it('should get schedules by teacher', async () => {
      const schedules = await scheduleStorage.getSchedulesByTeacher(testTeacherId);
      assert.strictEqual(schedules.length, 2); // Both created with same teacher
      const firstSchedule = schedules[0];
      if (!firstSchedule) throw new Error('No schedule found');
      assert.strictEqual(firstSchedule.teacherId, testTeacherId);
    });
  });

  await describe('getCurrentSchedule', async () => {
    beforeEach(async () => {
      await db.delete(schedules);
    });

    await it('should return null on weekends', async () => {
      await scheduleStorage.createSchedule({
        classroomId: testClassroomId,
        teacherId: testTeacherId,
        groupId: testGroupId,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '09:00',
      });

      const sunday = new Date('2025-01-05T09:00:00');
      const result = await scheduleStorage.getCurrentSchedule(testClassroomId, sunday);
      assert.strictEqual(result, null);
    });

    await it('should return correct schedule for current time', async () => {
      await scheduleStorage.createSchedule({
        classroomId: testClassroomId,
        teacherId: testTeacherId,
        groupId: testGroupId,
        dayOfWeek: 3,
        startTime: '08:00',
        endTime: '09:00',
      });

      const wednesday = new Date('2025-01-08T08:30:00'); // Wed Jan 08 2025
      const result = await scheduleStorage.getCurrentSchedule(testClassroomId, wednesday);

      assert.ok(result !== null);
      assert.strictEqual(result.groupId, testGroupId);
    });

    await it('should return null outside scheduled times', async () => {
      await scheduleStorage.createSchedule({
        classroomId: testClassroomId,
        teacherId: testTeacherId,
        groupId: testGroupId,
        dayOfWeek: 3,
        startTime: '08:00',
        endTime: '09:00',
      });

      const wednesday = new Date('2025-01-08T10:00:00');
      const result = await scheduleStorage.getCurrentSchedule(testClassroomId, wednesday);
      assert.strictEqual(result, null);
    });
  });
});
