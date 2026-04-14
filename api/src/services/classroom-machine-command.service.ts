import * as classroomStorage from '../lib/classroom-storage.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import {
  buildWhitelistUrl,
  generateMachineToken,
  hashMachineToken,
} from '../lib/machine-download-token.js';

import type {
  ClassroomResult,
  MachineRegistrationResult,
  RegisterMachineInput,
  RotateMachineTokenResult,
} from './classroom-service-shared.js';

export async function registerMachine(
  input: RegisterMachineInput
): Promise<ClassroomResult<MachineRegistrationResult>> {
  if (!input.hostname || input.hostname.trim() === '') {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'Hostname required' },
    };
  }

  let classroomId = input.classroomId;
  if (!classroomId && input.classroomName) {
    const classroom = await classroomStorage.getClassroomByName(input.classroomName);
    if (classroom) {
      classroomId = classroom.id;
    }
  }

  if (!classroomId) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Valid classroom_id or classroom_name is required' },
    };
  }

  const classroom = await classroomStorage.getClassroomById(classroomId);
  if (!classroom) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Classroom not found' },
    };
  }

  const reportedHostname = input.hostname.trim();
  const machineHostname = classroomStorage.buildMachineKey(classroom.id, reportedHostname);
  const machine = await classroomStorage.registerMachine({
    hostname: machineHostname,
    reportedHostname,
    classroomId: classroom.id,
    ...(input.version ? { version: input.version } : {}),
  });

  return {
    ok: true,
    data: {
      hostname: machine.reportedHostname ?? reportedHostname,
      classroomId: machine.classroomId ?? classroom.id,
      classroomName: classroom.name,
      lastSeen: machine.lastSeen?.toISOString() ?? new Date().toISOString(),
      ...(machine.version !== null && { version: machine.version }),
    },
  };
}

export async function deleteMachine(hostname: string): Promise<ClassroomResult<{ success: true }>> {
  if (!(await classroomStorage.deleteMachine(hostname))) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Machine not found' } };
  }

  return { ok: true, data: { success: true } };
}

export async function rotateMachineToken(
  machineId: string
): Promise<ClassroomResult<RotateMachineTokenResult>> {
  const machine = await classroomStorage.getMachineById(machineId);
  if (!machine) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Machine not found' } };
  }

  const token = generateMachineToken();
  const tokenHash = hashMachineToken(token);
  await classroomStorage.setMachineDownloadTokenHash(machineId, tokenHash);

  const publicUrl = config.publicUrl ?? `http://${config.host}:${String(config.port)}`;
  const whitelistUrl = buildWhitelistUrl(publicUrl, token);

  logger.info('Machine download token rotated via dashboard', {
    machineId,
    hostname: machine.hostname,
  });

  return { ok: true, data: { whitelistUrl } };
}
