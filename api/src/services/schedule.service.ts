/**
 * ScheduleService - Business logic for schedule management
 */

import * as scheduleStorage from '../lib/schedule-storage.js';
import * as auth from '../lib/auth.js';
import type { Schedule, OneOffSchedule, JWTPayload } from '../types/index.js';
import { getErrorMessage } from '@openpath/shared';
import { ensureUserCanAccessClassroom } from './classroom.service.js';
import DomainEventsService from './domain-events.service.js';

// =============================================================================
// Types
// =============================================================================

export type ScheduleServiceError =
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'FORBIDDEN'; message: string }
  | { code: 'CONFLICT'; message: string }
  | { code: 'BAD_REQUEST'; message: string };

export type ScheduleResult<T> = { ok: true; data: T } | { ok: false; error: ScheduleServiceError };

export interface ScheduleWithPermissions extends Schedule {
  isMine: boolean;
  canEdit: boolean;
}

export interface OneOffScheduleWithPermissions extends OneOffSchedule {
  isMine: boolean;
  canEdit: boolean;
}

export interface ClassroomScheduleResult {
  classroom: {
    id: string;
    name: string;
    displayName: string;
  };
  schedules: ScheduleWithPermissions[];
  oneOffSchedules: OneOffScheduleWithPermissions[];
}

// =============================================================================
// Helper Functions
// =============================================================================

interface StorageSchedule {
  id: string;
  classroomId: string;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  startAt: Date | null;
  endAt: Date | null;
  groupId: string;
  teacherId: string;
  recurrence: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

function normalizeTime(time: string): string {
  const parts = time.split(':');
  const hours = parts[0];
  const minutes = parts[1];
  if (hours !== undefined && minutes !== undefined) {
    return `${hours}:${minutes}`;
  }
  return time;
}

function mapToWeeklySchedule(s: StorageSchedule): Schedule {
  if (s.dayOfWeek === null || s.startTime === null || s.endTime === null) {
    throw new Error('Weekly schedule is missing required fields');
  }

  return {
    id: s.id,
    classroomId: s.classroomId,
    dayOfWeek: s.dayOfWeek,
    startTime: normalizeTime(s.startTime),
    endTime: normalizeTime(s.endTime),
    groupId: s.groupId,
    teacherId: s.teacherId,
    recurrence: s.recurrence ?? 'weekly',
    createdAt: s.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: s.updatedAt?.toISOString() ?? undefined,
  };
}

function mapToOneOffSchedule(s: StorageSchedule): OneOffSchedule {
  if (s.startAt === null || s.endAt === null) {
    throw new Error('One-off schedule is missing required fields');
  }

  return {
    id: s.id,
    classroomId: s.classroomId,
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    groupId: s.groupId,
    teacherId: s.teacherId,
    recurrence: 'one_off',
    createdAt: s.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: s.updatedAt?.toISOString() ?? undefined,
  };
}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Get schedules for a classroom with user permissions
 */
export async function getSchedulesByClassroom(
  classroomId: string,
  user: JWTPayload
): Promise<ScheduleResult<ClassroomScheduleResult>> {
  const access = await ensureUserCanAccessClassroom(user, classroomId);
  if (!access.ok) {
    return access;
  }

  const schedules = await scheduleStorage.getSchedulesByClassroom(classroomId);
  const oneOffSchedules = await scheduleStorage.getOneOffSchedulesByClassroom(classroomId);
  const userId = user.sub;
  const isAdmin = auth.isAdminToken(user);

  return {
    ok: true,
    data: {
      classroom: {
        id: access.data.id,
        name: access.data.name,
        displayName: access.data.displayName,
      },
      schedules: schedules.map((s) => ({
        ...mapToWeeklySchedule(s),
        isMine: s.teacherId === userId,
        canEdit: s.teacherId === userId || isAdmin,
      })),
      oneOffSchedules: oneOffSchedules.map((s) => ({
        ...mapToOneOffSchedule(s),
        isMine: s.teacherId === userId,
        canEdit: s.teacherId === userId || isAdmin,
      })),
    },
  };
}

/**
 * Create a new schedule reservation
 */
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
    const message = getErrorMessage(error);
    if (message === 'Schedule conflict') {
      return {
        ok: false,
        error: { code: 'CONFLICT', message: 'This time slot is already reserved' },
      };
    }
    return { ok: false, error: { code: 'BAD_REQUEST', message } };
  }
}

/**
 * Create a new one-off schedule reservation
 */
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
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'startAt must be a valid date' } };
  }
  if (!Number.isFinite(endAt.getTime())) {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'endAt must be a valid date' } };
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
    const message = getErrorMessage(error);
    if (message === 'Schedule conflict') {
      return {
        ok: false,
        error: { code: 'CONFLICT', message: 'This time slot is already reserved' },
      };
    }
    return { ok: false, error: { code: 'BAD_REQUEST', message } };
  }
}

/**
 * Update an existing schedule
 */
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

  // Reject empty-string groupId explicitly (router should also prevent this).
  if (input.groupId?.trim() === '') {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'groupId cannot be empty' } };
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
    const message = getErrorMessage(error);
    if (message === 'Schedule conflict') {
      return {
        ok: false,
        error: { code: 'CONFLICT', message: 'This time slot is already reserved' },
      };
    }
    return { ok: false, error: { code: 'BAD_REQUEST', message } };
  }
}

/**
 * Update an existing one-off schedule
 */
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
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'Schedule is not one-off' } };
  }

  const isAdmin = auth.isAdminToken(user);
  const isOwner = schedule.teacherId === user.sub;

  if (input.groupId?.trim() === '') {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'groupId cannot be empty' } };
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
      return { ok: false, error: { code: 'BAD_REQUEST', message: 'startAt must be a valid date' } };
    }
    updates.startAt = startAt;
  }
  if (input.endAt !== undefined) {
    const endAt = new Date(input.endAt);
    if (!Number.isFinite(endAt.getTime())) {
      return { ok: false, error: { code: 'BAD_REQUEST', message: 'endAt must be a valid date' } };
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
    const message = getErrorMessage(error);
    if (message === 'Schedule conflict') {
      return {
        ok: false,
        error: { code: 'CONFLICT', message: 'This time slot is already reserved' },
      };
    }
    return { ok: false, error: { code: 'BAD_REQUEST', message } };
  }
}

/**
 * Delete a schedule reservation
 */
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

/**
 * Get current active schedule for a classroom
 */
export async function getCurrentSchedule(
  classroomId: string
): Promise<Schedule | OneOffSchedule | null> {
  const s = await scheduleStorage.getCurrentSchedule(classroomId);
  if (!s) return null;
  if (s.recurrence === 'one_off') return mapToOneOffSchedule(s);
  return mapToWeeklySchedule(s);
}

export async function getCurrentScheduleForUser(
  classroomId: string,
  user: JWTPayload
): Promise<ScheduleResult<Schedule | OneOffSchedule | null>> {
  const access = await ensureUserCanAccessClassroom(user, classroomId);
  if (!access.ok) {
    return access;
  }

  return { ok: true, data: await getCurrentSchedule(classroomId) };
}

/**
 * Get schedules for a teacher
 */
export async function getSchedulesByTeacher(teacherId: string): Promise<Schedule[]> {
  const s = await scheduleStorage.getSchedulesByTeacher(teacherId);
  return s.map(mapToWeeklySchedule);
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  getSchedulesByClassroom,
  getSchedulesByTeacher,
  createSchedule,
  createOneOffSchedule,
  updateSchedule,
  updateOneOffSchedule,
  deleteSchedule,
  getCurrentSchedule,
  getCurrentScheduleForUser,
};
