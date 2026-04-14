import {
  MachineExemptionError,
  createMachineExemption,
  deleteMachineExemption,
  getActiveMachineExemptionsByClassroom,
  getMachineExemptionById,
} from '../lib/exemption-storage.js';

import DomainEventsService from './domain-events.service.js';
import { ensureUserCanAccessClassroom } from './classroom-access.service.js';
import type {
  ClassroomResult,
  ClassroomUser,
  CreateMachineExemptionInput,
  MachineExemptionInfo,
} from './classroom-service-shared.js';
import { toMachineExemptionInfo } from './classroom-service-shared.js';

export async function createExemptionForClassroom(
  user: ClassroomUser,
  input: CreateMachineExemptionInput
): Promise<ClassroomResult<MachineExemptionInfo>> {
  const access = await ensureUserCanAccessClassroom(user, input.classroomId);
  if (!access.ok) {
    return access;
  }

  try {
    const created = await DomainEventsService.withQueuedEvents(async (events) => {
      const exemption = await createMachineExemption({
        machineId: input.machineId,
        classroomId: input.classroomId,
        scheduleId: input.scheduleId,
        createdBy: input.createdBy,
      });
      events.publishClassroomChanged(input.classroomId);
      return exemption;
    });

    return { ok: true, data: toMachineExemptionInfo(created) };
  } catch (error: unknown) {
    if (error instanceof MachineExemptionError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }

    return {
      ok: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create machine exemption' },
    };
  }
}

export async function deleteExemptionForClassroom(
  user: ClassroomUser,
  exemptionId: string
): Promise<ClassroomResult<{ success: true }>> {
  const existing = await getMachineExemptionById(exemptionId);
  if (!existing) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Exemption not found' } };
  }

  const access = await ensureUserCanAccessClassroom(user, existing.classroomId);
  if (!access.ok) {
    return access;
  }

  const deleted = await DomainEventsService.withQueuedEvents(async (events) => {
    const removed = await deleteMachineExemption(exemptionId);
    if (removed) {
      events.publishClassroomChanged(removed.classroomId);
    }
    return removed;
  });
  if (!deleted) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Exemption not found' } };
  }
  return { ok: true, data: { success: true } };
}

export async function listExemptionsForClassroom(
  user: ClassroomUser,
  classroomId: string
): Promise<ClassroomResult<{ classroomId: string; exemptions: MachineExemptionInfo[] }>> {
  const access = await ensureUserCanAccessClassroom(user, classroomId);
  if (!access.ok) {
    return access;
  }

  const rows = await getActiveMachineExemptionsByClassroom(classroomId, new Date());
  return {
    ok: true,
    data: {
      classroomId,
      exemptions: rows.map(toMachineExemptionInfo),
    },
  };
}
