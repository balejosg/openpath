import * as auth from '../lib/auth.js';
import * as scheduleStorage from '../lib/schedule-storage.js';

import { ensureUserCanAccessClassroom } from './classroom.service.js';
import type { ScheduleResult } from './schedule-service-shared.js';
import type { JWTPayload } from '../types/index.js';

export function conflictResult(): ScheduleResult<never> {
  return {
    ok: false,
    error: { code: 'CONFLICT', message: 'This time slot is already reserved' },
  };
}

export function badRequestResult(message: string): ScheduleResult<never> {
  return { ok: false, error: { code: 'BAD_REQUEST', message } };
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function ensureScheduleCreationAccess(
  user: JWTPayload,
  input: { classroomId: string; groupId: string }
): Promise<ScheduleResult<void>> {
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

  return { ok: true, data: undefined };
}

export async function loadManagedSchedule(
  id: string,
  user: JWTPayload
): Promise<
  ScheduleResult<
    Awaited<ReturnType<typeof scheduleStorage.getScheduleById>> extends infer T
      ? Exclude<T, null>
      : never
  >
> {
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

  return { ok: true, data: schedule };
}

export function validateGroupChange(
  user: JWTPayload,
  currentGroupId: string,
  nextGroupId: string | undefined
): ScheduleResult<void> | null {
  if (nextGroupId?.trim() === '') {
    return badRequestResult('groupId cannot be empty');
  }

  if (nextGroupId !== undefined && nextGroupId !== currentGroupId) {
    if (!auth.isAdminToken(user) && !auth.canApproveGroup(user, nextGroupId)) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'You can only use your assigned groups' },
      };
    }
  }

  return null;
}

export function parseOneOffUpdateInput(input: {
  startAt?: string | undefined;
  endAt?: string | undefined;
  groupId?: string | undefined;
}): ScheduleResult<{ startAt?: Date; endAt?: Date; groupId?: string }> {
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

  return { ok: true, data: updates };
}
