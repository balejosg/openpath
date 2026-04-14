/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Schedule storage query operations.
 */

import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db, schedules } from '../db/index.js';
import type { DBSchedule } from './schedule-storage-shared.js';
import { weeklyRecurrenceWhereClause } from './schedule-storage-shared.js';

export async function getSchedulesByClassroom(classroomId: string): Promise<DBSchedule[]> {
  return await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.classroomId, classroomId), weeklyRecurrenceWhereClause()))
    .orderBy(schedules.dayOfWeek, schedules.startTime);
}

export async function getSchedulesByTeacher(teacherId: string): Promise<DBSchedule[]> {
  return await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.teacherId, teacherId), weeklyRecurrenceWhereClause()))
    .orderBy(schedules.dayOfWeek, schedules.startTime);
}

export async function getScheduleById(id: string): Promise<DBSchedule | null> {
  const result = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getOneOffSchedulesByClassroom(classroomId: string): Promise<DBSchedule[]> {
  return await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.classroomId, classroomId), eq(schedules.recurrence, 'one_off')))
    .orderBy(schedules.startAt);
}

export async function getOneOffSchedulesByTeacher(teacherId: string): Promise<DBSchedule[]> {
  return await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.teacherId, teacherId), eq(schedules.recurrence, 'one_off')))
    .orderBy(schedules.startAt);
}

export async function getCurrentSchedule(
  classroomId: string,
  date: Date = new Date()
): Promise<DBSchedule | null> {
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

  if (oneOff[0]) {
    return oneOff[0];
  }

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

export async function getCurrentSchedulesByClassroomIds(
  classroomIds: string[],
  date: Date = new Date()
): Promise<Map<string, DBSchedule>> {
  const normalizedClassroomIds = [...new Set(classroomIds.filter((id) => id.length > 0))];
  const result = new Map<string, DBSchedule>();

  if (normalizedClassroomIds.length === 0) {
    return result;
  }

  const oneOffRows = await db
    .select()
    .from(schedules)
    .where(
      and(
        inArray(schedules.classroomId, normalizedClassroomIds),
        eq(schedules.recurrence, 'one_off'),
        sql`${schedules.startAt} <= ${date} AND ${schedules.endAt} > ${date}`
      )
    )
    .orderBy(schedules.classroomId, schedules.startAt);

  for (const row of oneOffRows) {
    if (!result.has(row.classroomId)) {
      result.set(row.classroomId, row);
    }
  }

  const unresolvedClassroomIds = normalizedClassroomIds.filter((id) => !result.has(id));
  const dayOfWeek = date.getDay();
  if (unresolvedClassroomIds.length === 0 || dayOfWeek === 0 || dayOfWeek === 6) {
    return result;
  }

  const currentTime = date.toTimeString().slice(0, 5);
  const weeklyRows = await db
    .select()
    .from(schedules)
    .where(
      and(
        inArray(schedules.classroomId, unresolvedClassroomIds),
        weeklyRecurrenceWhereClause(),
        eq(schedules.dayOfWeek, dayOfWeek),
        sql`${schedules.startTime} <= ${currentTime}::time`,
        sql`${schedules.endTime} > ${currentTime}::time`
      )
    )
    .orderBy(schedules.classroomId, schedules.startTime);

  for (const row of weeklyRows) {
    if (!result.has(row.classroomId)) {
      result.set(row.classroomId, row);
    }
  }

  return result;
}

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

  return [...new Set([...oneOffRows, ...weeklyRows].map((row) => row.classroomId))];
}
