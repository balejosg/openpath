import * as auth from '../lib/auth.js';
import * as classroomStorage from '../lib/classroom-storage.js';
import { logger } from '../lib/logger.js';

import DomainEventsService from './domain-events.service.js';
import { ensureUserCanAccessClassroom } from './classroom-access.service.js';
import { getClassroom } from './classroom-query.service.js';
import type {
  ClassroomResult,
  ClassroomUser,
  ClassroomWithMachines,
  CreateClassroomInput,
  SetActiveGroupInput,
  UpdateClassroomData,
} from './classroom-service-shared.js';
import { formatErrorMessage } from './classroom-service-shared.js';

export async function createClassroom(
  input: CreateClassroomInput
): Promise<ClassroomResult<Awaited<ReturnType<typeof classroomStorage.createClassroom>>>> {
  try {
    const createData = {
      name: input.name,
      displayName: input.displayName,
      ...(input.defaultGroupId !== undefined ? { defaultGroupId: input.defaultGroupId } : {}),
    };
    const created = await classroomStorage.createClassroom(createData);
    return { ok: true, data: created };
  } catch (error) {
    logger.error('classrooms.create error', { error: formatErrorMessage(error), input });
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        return { ok: false, error: { code: 'CONFLICT', message: error.message } };
      }
      if (error.message.includes('invalid')) {
        return { ok: false, error: { code: 'BAD_REQUEST', message: error.message } };
      }
    }

    return {
      ok: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create classroom' },
    };
  }
}

export async function updateClassroom(
  id: string,
  updates: UpdateClassroomData
): Promise<ClassroomResult<Awaited<ReturnType<typeof classroomStorage.updateClassroom>>>> {
  const updated = await classroomStorage.updateClassroom(id, updates);
  if (!updated) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Classroom not found' } };
  }

  if (updates.defaultGroupId !== undefined) {
    DomainEventsService.publishClassroomChanged(updated.id);
  }

  return { ok: true, data: updated };
}

export async function setClassroomActiveGroup(
  user: ClassroomUser,
  input: SetActiveGroupInput
): Promise<ClassroomResult<{ classroom: ClassroomWithMachines; currentGroupId: string | null }>> {
  const access = await ensureUserCanAccessClassroom(user, input.id);
  if (!access.ok) {
    return access;
  }

  if (
    input.groupId !== null &&
    !auth.isAdminToken(user) &&
    !auth.canApproveGroup(user, input.groupId)
  ) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You can only set groups within your assigned scope' },
    };
  }

  const updated = await classroomStorage.setActiveGroup(input.id, input.groupId);
  if (!updated) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Classroom not found' } };
  }

  DomainEventsService.publishClassroomChanged(updated.id);

  const result = await getClassroom(input.id, user);
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    data: {
      classroom: result.data,
      currentGroupId: result.data.currentGroupId,
    },
  };
}

export async function deleteClassroom(id: string): Promise<ClassroomResult<{ success: true }>> {
  if (!(await classroomStorage.deleteClassroom(id))) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Classroom not found' } };
  }

  return { ok: true, data: { success: true } };
}
