/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Schedule storage command operations.
 */

import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schedules } from '../db/index.js';
import { getRowCount } from './utils.js';
import {
  assertValidOneOffScheduleValues,
  assertValidScheduleValues,
  createScheduleConflictError,
  findConflict,
  findOneOffConflict,
  type CreateOneOffScheduleInput,
  type CreateScheduleInput,
  type DBSchedule,
  type UpdateOneOffScheduleInput,
  type UpdateScheduleInput,
} from './schedule-storage-shared.js';
import { getScheduleById } from './schedule-storage-query.js';

export async function createOneOffSchedule(
  scheduleData: CreateOneOffScheduleInput
): Promise<DBSchedule> {
  const { classroomId, teacherId, groupId, startAt, endAt } = scheduleData;

  assertValidOneOffScheduleValues({ startAt, endAt });

  const conflict = await findOneOffConflict(classroomId, startAt, endAt);
  if (conflict !== null) {
    throw createScheduleConflictError(conflict);
  }

  const id = crypto.randomUUID();
  const [result] = await db
    .insert(schedules)
    .values({
      id,
      classroomId,
      teacherId,
      groupId,
      dayOfWeek: null,
      startTime: null,
      endTime: null,
      startAt,
      endAt,
      recurrence: 'one_off',
    })
    .returning();

  if (!result) {
    throw new Error('Failed to create schedule');
  }

  return result;
}

export async function createSchedule(scheduleData: CreateScheduleInput): Promise<DBSchedule> {
  const { classroomId, teacherId, groupId, dayOfWeek, startTime, endTime } = scheduleData;

  assertValidScheduleValues({ dayOfWeek, startTime, endTime });

  const conflict = await findConflict(classroomId, dayOfWeek, startTime, endTime);
  if (conflict !== null) {
    throw createScheduleConflictError(conflict);
  }

  const id = crypto.randomUUID();
  const [result] = await db
    .insert(schedules)
    .values({
      id,
      classroomId,
      teacherId,
      groupId,
      dayOfWeek,
      startTime,
      endTime,
      recurrence: 'weekly',
    })
    .returning();

  if (!result) {
    throw new Error('Failed to create schedule');
  }

  return result;
}

export async function updateSchedule(
  id: string,
  updates: UpdateScheduleInput
): Promise<DBSchedule | null> {
  const schedule = await getScheduleById(id);
  if (!schedule) {
    return null;
  }

  if (schedule.recurrence === 'one_off') {
    throw new Error('Cannot update one-off schedule with weekly updater');
  }

  const baseDayOfWeek = schedule.dayOfWeek;
  const baseStartTime = schedule.startTime;
  const baseEndTime = schedule.endTime;
  if (baseDayOfWeek === null || baseStartTime === null || baseEndTime === null) {
    throw new Error('Weekly schedule is missing required fields');
  }

  const newDayOfWeek = updates.dayOfWeek ?? baseDayOfWeek;
  const newStartTime = updates.startTime ?? baseStartTime;
  const newEndTime = updates.endTime ?? baseEndTime;

  assertValidScheduleValues({
    dayOfWeek: newDayOfWeek,
    startTime: newStartTime,
    endTime: newEndTime,
  });

  const conflict = await findConflict(
    schedule.classroomId,
    newDayOfWeek,
    newStartTime,
    newEndTime,
    id
  );
  if (conflict !== null) {
    throw createScheduleConflictError(conflict);
  }

  const updateValues: Partial<typeof schedules.$inferInsert> = {};
  if (updates.dayOfWeek !== undefined) {
    updateValues.dayOfWeek = updates.dayOfWeek;
  }
  if (updates.startTime !== undefined) {
    updateValues.startTime = updates.startTime;
  }
  if (updates.endTime !== undefined) {
    updateValues.endTime = updates.endTime;
  }
  if (updates.groupId !== undefined) {
    updateValues.groupId = updates.groupId;
  }

  if (Object.keys(updateValues).length === 0) {
    return schedule;
  }

  const [result] = await db
    .update(schedules)
    .set(updateValues)
    .where(eq(schedules.id, id))
    .returning();

  return result ?? null;
}

export async function updateOneOffSchedule(
  id: string,
  updates: UpdateOneOffScheduleInput
): Promise<DBSchedule | null> {
  const schedule = await getScheduleById(id);
  if (!schedule) {
    return null;
  }

  if (schedule.recurrence !== 'one_off') {
    throw new Error('Cannot update weekly schedule with one-off updater');
  }

  const baseStartAt = schedule.startAt;
  const baseEndAt = schedule.endAt;
  if (baseStartAt === null || baseEndAt === null) {
    throw new Error('One-off schedule is missing required fields');
  }

  const newStartAt = updates.startAt ?? baseStartAt;
  const newEndAt = updates.endAt ?? baseEndAt;

  assertValidOneOffScheduleValues({ startAt: newStartAt, endAt: newEndAt });

  const conflict = await findOneOffConflict(schedule.classroomId, newStartAt, newEndAt, id);
  if (conflict !== null) {
    throw createScheduleConflictError(conflict);
  }

  const updateValues: Partial<typeof schedules.$inferInsert> = {};
  if (updates.startAt !== undefined) {
    updateValues.startAt = updates.startAt;
  }
  if (updates.endAt !== undefined) {
    updateValues.endAt = updates.endAt;
  }
  if (updates.groupId !== undefined) {
    updateValues.groupId = updates.groupId;
  }

  if (Object.keys(updateValues).length === 0) {
    return schedule;
  }

  updateValues.updatedAt = new Date();

  const [result] = await db
    .update(schedules)
    .set(updateValues)
    .where(eq(schedules.id, id))
    .returning();

  return result ?? null;
}

export async function deleteSchedule(id: string): Promise<boolean> {
  return getRowCount(await db.delete(schedules).where(eq(schedules.id, id))) > 0;
}

export async function deleteSchedulesByClassroom(classroomId: string): Promise<number> {
  return getRowCount(await db.delete(schedules).where(eq(schedules.classroomId, classroomId)));
}
