import * as scheduleStorage from '../lib/schedule-storage.js';

import DomainEventsService from './domain-events.service.js';
import {
  badRequestResult,
  conflictResult,
  ensureScheduleCreationAccess,
  toErrorMessage,
} from './schedule-command-shared.js';
import { mapToOneOffSchedule, mapToWeeklySchedule } from './schedule-service-shared.js';
import type { OneOffSchedule, Schedule, ScheduleResult } from './schedule-service-shared.js';
import type { JWTPayload } from '../types/index.js';

export async function createSchedule(
  input: {
    classroomId: string;
    groupId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  },
  user: JWTPayload
): Promise<ScheduleResult<Schedule>> {
  const access = await ensureScheduleCreationAccess(user, input);
  if (!access.ok) {
    return access;
  }

  try {
    const schedule = await scheduleStorage.createSchedule({
      classroomId: input.classroomId,
      teacherId: user.sub,
      groupId: input.groupId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
    });

    DomainEventsService.publishClassroomChanged(input.classroomId);
    return { ok: true, data: mapToWeeklySchedule(schedule) };
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    if (message === 'Schedule conflict') {
      return conflictResult();
    }
    return badRequestResult(message);
  }
}

export async function createOneOffSchedule(
  input: {
    classroomId: string;
    groupId: string;
    startAt: string;
    endAt: string;
  },
  user: JWTPayload
): Promise<ScheduleResult<OneOffSchedule>> {
  const access = await ensureScheduleCreationAccess(user, input);
  if (!access.ok) {
    return access;
  }

  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (!Number.isFinite(startAt.getTime())) {
    return badRequestResult('startAt must be a valid date');
  }
  if (!Number.isFinite(endAt.getTime())) {
    return badRequestResult('endAt must be a valid date');
  }

  try {
    const schedule = await scheduleStorage.createOneOffSchedule({
      classroomId: input.classroomId,
      teacherId: user.sub,
      groupId: input.groupId,
      startAt,
      endAt,
    });

    DomainEventsService.publishClassroomChanged(input.classroomId);
    return { ok: true, data: mapToOneOffSchedule(schedule) };
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    if (message === 'Schedule conflict') {
      return conflictResult();
    }
    return badRequestResult(message);
  }
}
