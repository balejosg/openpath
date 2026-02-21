/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Schedule Storage - PostgreSQL-based schedule management using Drizzle ORM
 */

import crypto from 'node:crypto';
import { eq, and, or, sql } from 'drizzle-orm';
import { db, schedules } from '../db/index.js';
import { logger } from './logger.js';

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

interface UpdateScheduleInput {
  dayOfWeek?: number | undefined;
  startTime?: string | undefined;
  endTime?: string | undefined;
  groupId?: string | undefined;
}

// =============================================================================
// Time Utilities
// =============================================================================

export function timeToMinutes(time: string): number {
  const parts = time.split(':').map(Number);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;
  return hours * 60 + minutes;
}

function parseTimeParts(time: string): { hours: number; minutes: number; seconds: number } {
  // Accept HH:MM or HH:MM:SS (DB may return seconds)
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(time);
  if (!match) {
    throw new Error('Invalid time format. Use HH:MM (24h)');
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? '0');

  return { hours, minutes, seconds };
}

function assertQuarterHour(time: string): void {
  const { minutes, seconds } = parseTimeParts(time);
  if (seconds !== 0) {
    throw new Error('Time must not include seconds');
  }
  if (minutes % 15 !== 0) {
    throw new Error('Time must be in 15-minute increments');
  }
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
  assertQuarterHour(startTime);
  assertQuarterHour(endTime);

  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    throw new Error('startTime must be before endTime');
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
    .where(eq(schedules.classroomId, classroomId))
    .orderBy(schedules.dayOfWeek, schedules.startTime);

  return result;
}

export async function getSchedulesByTeacher(teacherId: string): Promise<DBSchedule[]> {
  const result = await db
    .select()
    .from(schedules)
    .where(eq(schedules.teacherId, teacherId))
    .orderBy(schedules.dayOfWeek, schedules.startTime);

  return result;
}

export async function getScheduleById(id: string): Promise<DBSchedule | null> {
  const result = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);

  return result[0] ?? null;
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
          eq(schedules.dayOfWeek, dayOfWeek),
          sql`(${startTime}::time, ${endTime}::time) OVERLAPS (${schedules.startTime}, ${schedules.endTime})`,
          sql`${schedules.id} != ${excludeId}::uuid`
        )
      : and(
          eq(schedules.classroomId, classroomId),
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

  const newDayOfWeek = updates.dayOfWeek ?? schedule.dayOfWeek;
  const newStartTime = updates.startTime ?? schedule.startTime;
  const newEndTime = updates.endTime ?? schedule.endTime;

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

export async function deleteSchedule(id: string): Promise<boolean> {
  const result = await db.delete(schedules).where(eq(schedules.id, id));

  return (result.rowCount ?? 0) > 0;
}

export async function getCurrentSchedule(
  classroomId: string,
  date: Date = new Date()
): Promise<DBSchedule | null> {
  const dayOfWeek = date.getDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return null;
  }

  const currentTime = date.toTimeString().slice(0, 5);

  const result = await db
    .select()
    .from(schedules)
    .where(
      and(
        eq(schedules.classroomId, classroomId),
        eq(schedules.dayOfWeek, dayOfWeek),
        sql`${schedules.startTime} <= ${currentTime}::time`,
        sql`${schedules.endTime} > ${currentTime}::time`
      )
    )
    .limit(1);

  return result[0] ?? null;
}

/**
 * Get classroom IDs whose schedule starts or ends exactly at the given time.
 * Used to push near-real-time updates on schedule boundaries.
 */
export async function getClassroomIdsWithBoundaryAt(date: Date = new Date()): Promise<string[]> {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return [];

  const currentTime = date.toTimeString().slice(0, 5);

  const rows = await db
    .select({ classroomId: schedules.classroomId })
    .from(schedules)
    .where(
      and(
        eq(schedules.dayOfWeek, dayOfWeek),
        or(
          sql`${schedules.startTime} = ${currentTime}::time`,
          sql`${schedules.endTime} = ${currentTime}::time`
        )
      )
    );

  return [...new Set(rows.map((r) => r.classroomId))];
}

export async function deleteSchedulesByClassroom(classroomId: string): Promise<number> {
  const result = await db.delete(schedules).where(eq(schedules.classroomId, classroomId));

  return result.rowCount ?? 0;
}

export default {
  getSchedulesByClassroom,
  getSchedulesByTeacher,
  getScheduleById,
  findConflict,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getCurrentSchedule,
  getClassroomIdsWithBoundaryAt,
  deleteSchedulesByClassroom,
  timeToMinutes,
  timesOverlap,
};

logger.debug('Schedule storage initialized');
