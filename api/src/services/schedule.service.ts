/**
 * ScheduleService - Business logic for schedule management
 */

import * as scheduleStorage from '../lib/schedule-storage.js';
import * as classroomStorage from '../lib/classroom-storage.js';
import * as auth from '../lib/auth.js';
import { emitClassroomChanged } from '../lib/rule-events.js';
import type { Schedule, JWTPayload } from '../types/index.js';
import { getErrorMessage } from '@openpath/shared';

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

export interface ClassroomScheduleResult {
  classroom: {
    id: string;
    name: string;
    displayName: string;
  };
  schedules: ScheduleWithPermissions[];
}

// =============================================================================
// Helper Functions
// =============================================================================

interface StorageSchedule {
  id: string;
  classroomId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
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

function mapToSchedule(s: StorageSchedule): Schedule {
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
  const classroom = await classroomStorage.getClassroomById(classroomId);
  if (!classroom) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Classroom not found' } };
  }

  const schedules = await scheduleStorage.getSchedulesByClassroom(classroomId);
  const userId = user.sub;
  const isAdmin = auth.isAdminToken(user);

  return {
    ok: true,
    data: {
      classroom: {
        id: classroom.id,
        name: classroom.name,
        displayName: classroom.displayName,
      },
      schedules: schedules.map((s) => ({
        ...mapToSchedule(s),
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
  const classroom = await classroomStorage.getClassroomById(input.classroomId);
  if (!classroom) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Classroom not found' } };
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

    emitClassroomChanged(input.classroomId);
    return { ok: true, data: mapToSchedule(schedule) };
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

    emitClassroomChanged(schedule.classroomId);
    return { ok: true, data: mapToSchedule(updated) };
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

  const isAdmin = auth.isAdminToken(user);
  const isOwner = schedule.teacherId === user.sub;

  if (!isOwner && !isAdmin) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You can only manage your own schedules' },
    };
  }

  await scheduleStorage.deleteSchedule(id);

  emitClassroomChanged(schedule.classroomId);
  return { ok: true, data: { success: true } };
}

/**
 * Get current active schedule for a classroom
 */
export async function getCurrentSchedule(classroomId: string): Promise<Schedule | null> {
  const s = await scheduleStorage.getCurrentSchedule(classroomId);
  return s ? mapToSchedule(s) : null;
}

/**
 * Get schedules for a teacher
 */
export async function getSchedulesByTeacher(teacherId: string): Promise<Schedule[]> {
  const s = await scheduleStorage.getSchedulesByTeacher(teacherId);
  return s.map(mapToSchedule);
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  getSchedulesByClassroom,
  getSchedulesByTeacher,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getCurrentSchedule,
};
