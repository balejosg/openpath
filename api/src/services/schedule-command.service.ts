import * as scheduleStorage from '../lib/schedule-storage.js';
import * as auth from '../lib/auth.js';
import type { JWTPayload } from '../types/index.js';
import { ensureUserCanAccessClassroom } from './classroom.service.js';
import DomainEventsService from './domain-events.service.js';
import type { OneOffSchedule, Schedule, ScheduleResult } from './schedule-service-shared.js';
import { mapToOneOffSchedule, mapToWeeklySchedule } from './schedule-service-shared.js';

function conflictResult(): ScheduleResult<never> {
  return {
    ok: false,
    error: { code: 'CONFLICT', message: 'This time slot is already reserved' },
  };
}

function badRequestResult(message: string): ScheduleResult<never> {
  return { ok: false, error: { code: 'BAD_REQUEST', message } };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
  const access = await ensureUserCanAccessClassroom(user, input.classroomId);
  if (!access.ok) {
    return access;
  }

  const isAdmin = auth.isAdminToken(user);
  if (!isAdmin && !auth.canApproveGroup(user, input.groupId)) {
    return {
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'You can only create schedules for your assigned groups',
      },
    };
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
  const access = await ensureUserCanAccessClassroom(user, input.classroomId);
  if (!access.ok) {
    return access;
  }

  const isAdmin = auth.isAdminToken(user);
  if (!isAdmin && !auth.canApproveGroup(user, input.groupId)) {
    return {
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'You can only create schedules for your assigned groups',
      },
    };
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

export async function updateSchedule(
  id: string,
  input: {
    dayOfWeek?: number | undefined;
    startTime?: string | undefined;
    endTime?: string | undefined;
    groupId?: string | undefined;
  },
  user: JWTPayload
): Promise<ScheduleResult<Schedule>> {
  const schedule = await scheduleStorage.getScheduleById(id);
  if (!schedule) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } };
  }

  const access = await ensureUserCanAccessClassroom(user, schedule.classroomId);
  if (!access.ok) {
    return access;
  }

  const isAdmin = auth.isAdminToken(user);
  const isOwner = schedule.teacherId === user.sub;

  if (input.groupId?.trim() === '') {
    return badRequestResult('groupId cannot be empty');
  }

  if (!isOwner && !isAdmin) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You can only manage your own schedules' },
    };
  }

  if (input.groupId !== undefined && input.groupId !== schedule.groupId) {
    if (!isAdmin && !auth.canApproveGroup(user, input.groupId)) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'You can only use your assigned groups' },
      };
    }
  }

  try {
    const updated = await scheduleStorage.updateSchedule(id, input);
    if (!updated) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Schedule not found after update' },
      };
    }

    DomainEventsService.publishClassroomChanged(schedule.classroomId);
    return { ok: true, data: mapToWeeklySchedule(updated) };
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    if (message === 'Schedule conflict') {
      return conflictResult();
    }
    return badRequestResult(message);
  }
}

export async function updateOneOffSchedule(
  id: string,
  input: {
    startAt?: string | undefined;
    endAt?: string | undefined;
    groupId?: string | undefined;
  },
  user: JWTPayload
): Promise<ScheduleResult<OneOffSchedule>> {
  const schedule = await scheduleStorage.getScheduleById(id);
  if (!schedule) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } };
  }

  const access = await ensureUserCanAccessClassroom(user, schedule.classroomId);
  if (!access.ok) {
    return access;
  }

  if (schedule.recurrence !== 'one_off') {
    return badRequestResult('Schedule is not one-off');
  }

  const isAdmin = auth.isAdminToken(user);
  const isOwner = schedule.teacherId === user.sub;

  if (input.groupId?.trim() === '') {
    return badRequestResult('groupId cannot be empty');
  }

  if (!isOwner && !isAdmin) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You can only manage your own schedules' },
    };
  }

  if (input.groupId !== undefined && input.groupId !== schedule.groupId) {
    if (!isAdmin && !auth.canApproveGroup(user, input.groupId)) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'You can only use your assigned groups' },
      };
    }
  }

  const updates: { startAt?: Date; endAt?: Date; groupId?: string } = {};
  if (input.startAt !== undefined) {
    const startAt = new Date(input.startAt);
    if (!Number.isFinite(startAt.getTime())) {
      return badRequestResult('startAt must be a valid date');
    }
    updates.startAt = startAt;
  }
  if (input.endAt !== undefined) {
    const endAt = new Date(input.endAt);
    if (!Number.isFinite(endAt.getTime())) {
      return badRequestResult('endAt must be a valid date');
    }
    updates.endAt = endAt;
  }
  if (input.groupId !== undefined) {
    updates.groupId = input.groupId;
  }

  try {
    const updated = await scheduleStorage.updateOneOffSchedule(id, updates);
    if (!updated) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Schedule not found after update' },
      };
    }

    DomainEventsService.publishClassroomChanged(schedule.classroomId);
    return { ok: true, data: mapToOneOffSchedule(updated) };
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    if (message === 'Schedule conflict') {
      return conflictResult();
    }
    return badRequestResult(message);
  }
}

export async function deleteSchedule(
  id: string,
  user: JWTPayload
): Promise<ScheduleResult<{ success: boolean }>> {
  const schedule = await scheduleStorage.getScheduleById(id);
  if (!schedule) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } };
  }

  const access = await ensureUserCanAccessClassroom(user, schedule.classroomId);
  if (!access.ok) {
    return access;
  }

  const isAdmin = auth.isAdminToken(user);
  const isOwner = schedule.teacherId === user.sub;
  if (!isOwner && !isAdmin) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You can only manage your own schedules' },
    };
  }

  await scheduleStorage.deleteSchedule(id);
  DomainEventsService.publishClassroomChanged(schedule.classroomId);
  return { ok: true, data: { success: true } };
}

export const ScheduleCommandService = {
  createSchedule,
  createOneOffSchedule,
  updateSchedule,
  updateOneOffSchedule,
  deleteSchedule,
};

export default ScheduleCommandService;
