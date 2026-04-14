import * as scheduleStorage from '../lib/schedule-storage.js';

import DomainEventsService from './domain-events.service.js';
import {
  badRequestResult,
  conflictResult,
  loadManagedSchedule,
  parseOneOffUpdateInput,
  toErrorMessage,
  validateGroupChange,
} from './schedule-command-shared.js';
import { mapToOneOffSchedule, mapToWeeklySchedule } from './schedule-service-shared.js';
import type { OneOffSchedule, Schedule, ScheduleResult } from './schedule-service-shared.js';
import type { JWTPayload } from '../types/index.js';

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
  const loaded = await loadManagedSchedule(id, user);
  if (!loaded.ok) {
    return loaded;
  }

  const validation = validateGroupChange(user, loaded.data.groupId, input.groupId);
  if (validation && !validation.ok) {
    return validation;
  }

  try {
    const updated = await scheduleStorage.updateSchedule(id, input);
    if (!updated) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Schedule not found after update' },
      };
    }

    DomainEventsService.publishClassroomChanged(loaded.data.classroomId);
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
  const loaded = await loadManagedSchedule(id, user);
  if (!loaded.ok) {
    return loaded;
  }

  if (loaded.data.recurrence !== 'one_off') {
    return badRequestResult('Schedule is not one-off');
  }

  const validation = validateGroupChange(user, loaded.data.groupId, input.groupId);
  if (validation && !validation.ok) {
    return validation;
  }

  const updates = parseOneOffUpdateInput(input);
  if (!updates.ok) {
    return updates;
  }

  try {
    const updated = await scheduleStorage.updateOneOffSchedule(id, updates.data);
    if (!updated) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Schedule not found after update' },
      };
    }

    DomainEventsService.publishClassroomChanged(loaded.data.classroomId);
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
  const loaded = await loadManagedSchedule(id, user);
  if (!loaded.ok) {
    return loaded;
  }

  await scheduleStorage.deleteSchedule(id);
  DomainEventsService.publishClassroomChanged(loaded.data.classroomId);
  return { ok: true, data: { success: true } };
}
