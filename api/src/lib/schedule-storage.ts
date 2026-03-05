/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Schedule Storage - PostgreSQL-based schedule management using Drizzle ORM
 */

import crypto from 'node:crypto';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db, schedules } from '../db/index.js';
import { logger } from './logger.js';
import {
  assertQuarterHourInstant,
  assertQuarterHourTime,
  normalizeTimeHHMM,
  parseTimeToMinutes,
} from '@openpath/shared';

// =============================================================================
// Types
// =============================================================================

type DBSchedule = typeof schedules.$inferSelect;

interface ScheduleConflictError extends Error {
  conflict?: DBSchedule;
}

interface CreateScheduleInput {
  classroomId: string;
  teacherId: string;
  groupId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface CreateOneOffScheduleInput {
  classroomId: string;
  teacherId: string;
  groupId: string;
  startAt: Date;
  endAt: Date;
}

interface UpdateScheduleInput {
  dayOfWeek?: number | undefined;
  startTime?: string | undefined;
  endTime?: string | undefined;
  groupId?: string | undefined;
}

interface UpdateOneOffScheduleInput {
  startAt?: Date | undefined;
  endAt?: Date | undefined;
  groupId?: string | undefined;
}

function weeklyRecurrenceWhereClause(): ReturnType<typeof or> {
  return or(eq(schedules.recurrence, 'weekly'), isNull(schedules.recurrence));
}

// =============================================================================
// Time Utilities
// =============================================================================

export function timeToMinutes(time: string): number {
  return parseTimeToMinutes(normalizeTimeHHMM(time));
}

function assertValidScheduleValues(input: {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}): void {
  const { dayOfWeek, startTime, endTime } = input;

  if (dayOfWeek < 1 || dayOfWeek > 5) {
    throw new Error('dayOfWeek must be between 1 (Monday) and 5 (Friday)');
  }

  // Format + 15-minute granularity
  assertQuarterHourTime(startTime);
  assertQuarterHourTime(endTime);

  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    throw new Error('startTime must be before endTime');
  }
}

function assertValidOneOffScheduleValues(input: { startAt: Date; endAt: Date }): void {
  assertQuarterHourInstant(input.startAt);
  assertQuarterHourInstant(input.endAt);

  if (input.endAt.getTime() <= input.startAt.getTime()) {
    throw new Error('endAt must be after startAt');
  }
}

export function timesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);

  return s1 < e2 && s2 < e1;
}

// =============================================================================
// Schedule CRUD
// =============================================================================

export async function getSchedulesByClassroom(classroomId: string): Promise<DBSchedule[]> {
  const result = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.classroomId, classroomId), weeklyRecurrenceWhereClause()))
    .orderBy(schedules.dayOfWeek, schedules.startTime);

  return result;
}

export async function getSchedulesByTeacher(teacherId: string): Promise<DBSchedule[]> {
  const result = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.teacherId, teacherId), weeklyRecurrenceWhereClause()))
    .orderBy(schedules.dayOfWeek, schedules.startTime);

  return result;
}

export async function getScheduleById(id: string): Promise<DBSchedule | null> {
  const result = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);

  return result[0] ?? null;
}

export async function getOneOffSchedulesByClassroom(classroomId: string): Promise<DBSchedule[]> {
  const result = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.classroomId, classroomId), eq(schedules.recurrence, 'one_off')))
    .orderBy(schedules.startAt);

  return result;
}

export async function getOneOffSchedulesByTeacher(teacherId: string): Promise<DBSchedule[]> {
  const result = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.teacherId, teacherId), eq(schedules.recurrence, 'one_off')))
    .orderBy(schedules.startAt);

  return result;
}

export async function findOneOffConflict(
  classroomId: string,
  startAt: Date,
  endAt: Date,
  excludeId: string | null = null
): Promise<DBSchedule | null> {
  const conditions =
    excludeId !== null
      ? and(
          eq(schedules.classroomId, classroomId),
          eq(schedules.recurrence, 'one_off'),
          sql`${schedules.startAt} < ${endAt} AND ${schedules.endAt} > ${startAt}`,
          sql`${schedules.id} != ${excludeId}::uuid`
        )
      : and(
          eq(schedules.classroomId, classroomId),
          eq(schedules.recurrence, 'one_off'),
          sql`${schedules.startAt} < ${endAt} AND ${schedules.endAt} > ${startAt}`
        );

  const result = await db.select().from(schedules).where(conditions).limit(1);

  return result[0] ?? null;
}

export async function createOneOffSchedule(
  scheduleData: CreateOneOffScheduleInput
): Promise<DBSchedule> {
  const { classroomId, teacherId, groupId, startAt, endAt } = scheduleData;

  assertValidOneOffScheduleValues({ startAt, endAt });

  const conflict = await findOneOffConflict(classroomId, startAt, endAt);
  if (conflict !== null) {
    const error: ScheduleConflictError = new Error('Schedule conflict');
    error.conflict = conflict;
    throw error;
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

  if (!result) throw new Error('Failed to create schedule');
  return result;
}

export async function findConflict(
  classroomId: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  excludeId: string | null = null
): Promise<DBSchedule | null> {
  // Use raw SQL for OVERLAPS operator
  const conditions =
    excludeId !== null
      ? and(
          eq(schedules.classroomId, classroomId),
          weeklyRecurrenceWhereClause(),
          eq(schedules.dayOfWeek, dayOfWeek),
          sql`(${startTime}::time, ${endTime}::time) OVERLAPS (${schedules.startTime}, ${schedules.endTime})`,
          sql`${schedules.id} != ${excludeId}::uuid`
        )
      : and(
          eq(schedules.classroomId, classroomId),
          weeklyRecurrenceWhereClause(),
          eq(schedules.dayOfWeek, dayOfWeek),
          sql`(${startTime}::time, ${endTime}::time) OVERLAPS (${schedules.startTime}, ${schedules.endTime})`
        );

  const result = await db.select().from(schedules).where(conditions).limit(1);

  return result[0] ?? null;
}

export async function createSchedule(scheduleData: CreateScheduleInput): Promise<DBSchedule> {
  const { classroomId, teacherId, groupId, dayOfWeek, startTime, endTime } = scheduleData;

  assertValidScheduleValues({ dayOfWeek, startTime, endTime });

  const conflict = await findConflict(classroomId, dayOfWeek, startTime, endTime);
  if (conflict !== null) {
    const error: ScheduleConflictError = new Error('Schedule conflict');
    error.conflict = conflict;
    throw error;
  }

  const id = crypto.randomUUID();

  const [result] = await db
    .insert(schedules)
    .values({
      id,
      classroomId: classroomId,
      teacherId: teacherId,
      groupId: groupId,
      dayOfWeek: dayOfWeek,
      startTime: startTime,
      endTime: endTime,
      recurrence: 'weekly',
    })
    .returning();

  if (!result) throw new Error('Failed to create schedule');
  return result;
}

export async function updateSchedule(
  id: string,
  updates: UpdateScheduleInput
): Promise<DBSchedule | null> {
  const schedule = await getScheduleById(id);
  if (!schedule) return null;

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

  // Validate effective values to avoid persisting invalid data.
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
    const error: ScheduleConflictError = new Error('Schedule conflict');
    error.conflict = conflict;
    throw error;
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
  if (!schedule) return null;

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
    const error: ScheduleConflictError = new Error('Schedule conflict');
    error.conflict = conflict;
    throw error;
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
  const result = await db.delete(schedules).where(eq(schedules.id, id));

  return (result.rowCount ?? 0) > 0;
}

export async function getCurrentSchedule(
  classroomId: string,
  date: Date = new Date()
): Promise<DBSchedule | null> {
  // One-off schedules are absolute instants and may apply on any day.
  const oneOff = await db
    .select()
    .from(schedules)
    .where(
      and(
        eq(schedules.classroomId, classroomId),
        eq(schedules.recurrence, 'one_off'),
        sql`${schedules.startAt} <= ${date} AND ${schedules.endAt} > ${date}`
      )
    )
    .orderBy(schedules.startAt)
    .limit(1);

  if (oneOff[0]) return oneOff[0];

  const dayOfWeek = date.getDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return null;
  }

  const currentTime = date.toTimeString().slice(0, 5);

  const weekly = await db
    .select()
    .from(schedules)
    .where(
      and(
        eq(schedules.classroomId, classroomId),
        weeklyRecurrenceWhereClause(),
        eq(schedules.dayOfWeek, dayOfWeek),
        sql`${schedules.startTime} <= ${currentTime}::time`,
        sql`${schedules.endTime} > ${currentTime}::time`
      )
    )
    .limit(1);

  return weekly[0] ?? null;
}

/**
 * Get classroom IDs whose schedule starts or ends exactly at the given time.
 * Used to push near-real-time updates on schedule boundaries.
 */
export async function getClassroomIdsWithBoundaryAt(date: Date = new Date()): Promise<string[]> {
  const floored = new Date(date);
  floored.setSeconds(0, 0);

  const oneOffRows = await db
    .select({ classroomId: schedules.classroomId })
    .from(schedules)
    .where(
      and(
        eq(schedules.recurrence, 'one_off'),
        or(eq(schedules.startAt, floored), eq(schedules.endAt, floored))
      )
    );

  const dayOfWeek = date.getDay();

  let weeklyRows: { classroomId: string }[] = [];
  if (dayOfWeek !== 0 && dayOfWeek !== 6) {
    const currentTime = date.toTimeString().slice(0, 5);
    weeklyRows = await db
      .select({ classroomId: schedules.classroomId })
      .from(schedules)
      .where(
        and(
          weeklyRecurrenceWhereClause(),
          eq(schedules.dayOfWeek, dayOfWeek),
          or(
            sql`${schedules.startTime} = ${currentTime}::time`,
            sql`${schedules.endTime} = ${currentTime}::time`
          )
        )
      );
  }

  return [...new Set([...oneOffRows, ...weeklyRows].map((r) => r.classroomId))];
}

export async function deleteSchedulesByClassroom(classroomId: string): Promise<number> {
  const result = await db.delete(schedules).where(eq(schedules.classroomId, classroomId));

  return result.rowCount ?? 0;
}

export default {
  getSchedulesByClassroom,
  getSchedulesByTeacher,
  getOneOffSchedulesByClassroom,
  getOneOffSchedulesByTeacher,
  getScheduleById,
  findConflict,
  findOneOffConflict,
  createSchedule,
  createOneOffSchedule,
  updateSchedule,
  updateOneOffSchedule,
  deleteSchedule,
  getCurrentSchedule,
  getClassroomIdsWithBoundaryAt,
  deleteSchedulesByClassroom,
  timeToMinutes,
  timesOverlap,
};

logger.debug('Schedule storage initialized');
