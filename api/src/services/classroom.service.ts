/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * ClassroomService - Business logic for classroom and machine management
 */

import * as classroomStorage from '../lib/classroom-storage.js';
import * as auth from '../lib/auth.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import {
  MachineExemptionError,
  createMachineExemption,
  deleteMachineExemption,
  getActiveMachineExemptionsByClassroom,
  getMachineExemptionById,
} from '../lib/exemption-storage.js';
import {
  buildWhitelistUrl,
  generateMachineToken,
  hashMachineToken,
} from '../lib/machine-download-token.js';

import {
  calculateClassroomMachineStatus as calculateMachineStatus,
  calculateClassroomStatus,
  type ClassroomMachineStatus as SharedMachineStatus,
  type ClassroomStatus as SharedClassroomStatus,
  type CurrentGroupSource as SharedCurrentGroupSource,
} from '@openpath/shared/classroom-status';
import type { JWTPayload } from '../types/index.js';
import DomainEventsService from './domain-events.service.js';

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeCurrentGroupSource(value: unknown): CurrentGroupSource {
  return value === 'manual' || value === 'schedule' || value === 'default' || value === 'none'
    ? value
    : 'none';
}

// =============================================================================
// Types
// =============================================================================

export interface RegisterMachineInput {
  hostname: string;
  classroomId?: string | undefined;
  classroomName?: string | undefined;
  version?: string | undefined;
}

export type MachineStatus = SharedMachineStatus;
export type ClassroomStatus = SharedClassroomStatus;

export interface MachineInfo {
  id: string;
  hostname: string;
  lastSeen: string | null;
  status: MachineStatus;
}

export interface MachineRegistrationResult {
  hostname: string;
  classroomId: string;
  classroomName: string;
  version?: string;
  lastSeen: string;
}

export type CurrentGroupSource = SharedCurrentGroupSource;

export interface ClassroomWithMachines {
  id: string;
  name: string;
  displayName: string;
  defaultGroupId: string | null;
  activeGroupId: string | null;
  createdAt: string;
  updatedAt: string;
  currentGroupId: string | null;
  currentGroupSource: CurrentGroupSource;
  machines: MachineInfo[];
  machineCount: number;
  status: ClassroomStatus;
  onlineMachineCount: number;
}

export interface ClassroomAccessScope {
  id: string;
  name: string;
  displayName: string;
  defaultGroupId: string | null;
  activeGroupId: string | null;
  currentGroupId: string | null;
  currentGroupSource: CurrentGroupSource;
}

export interface UpdateClassroomData {
  name?: string;
  displayName?: string;
  defaultGroupId?: string;
  activeGroupId?: string;
}

export interface CreateClassroomInput {
  name: string;
  displayName: string;
  defaultGroupId?: string | undefined;
}

export interface SetActiveGroupInput {
  id: string;
  groupId: string | null;
}

export interface CreateMachineExemptionInput {
  machineId: string;
  classroomId: string;
  scheduleId: string;
  createdBy: string;
}

export interface MachineExemptionInfo {
  id: string;
  machineId: string;
  machineHostname?: string;
  classroomId: string;
  scheduleId: string;
  createdBy: string | null;
  createdAt: string | null;
  expiresAt: string;
}

export interface ClassroomMachineListItem {
  id: string;
  hostname: string;
  classroomId: string | null;
  version: string | null;
  lastSeen: string | null;
  hasDownloadToken: boolean;
  downloadTokenLastRotatedAt: string | null;
}

export interface RotateMachineTokenResult {
  whitelistUrl: string;
}

// Use standard tRPC error codes for easy mapping
export type ClassroomServiceError =
  | { code: 'BAD_REQUEST'; message: string }
  | { code: 'FORBIDDEN'; message: string }
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'CONFLICT'; message: string }
  | { code: 'INTERNAL_SERVER_ERROR'; message: string };

export type ClassroomResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ClassroomServiceError };

export type ClassroomAccessResult =
  | { ok: true; data: ClassroomAccessScope }
  | { ok: false; error: { code: 'FORBIDDEN' | 'NOT_FOUND'; message: string } };

// =============================================================================
// Service Implementation
// =============================================================================

function canAccessClassroomScope(
  user: JWTPayload,
  scope: Pick<ClassroomAccessScope, 'defaultGroupId' | 'activeGroupId' | 'currentGroupId'>
): boolean {
  if (auth.isAdminToken(user)) {
    return true;
  }

  const candidateGroupIds = [
    scope.activeGroupId,
    scope.currentGroupId,
    scope.defaultGroupId,
  ].filter((groupId): groupId is string => typeof groupId === 'string' && groupId.length > 0);

  return candidateGroupIds.some((groupId) => auth.canApproveGroup(user, groupId));
}

type ClassroomAccessPurpose = 'view' | 'enroll';

async function resolveClassroomAccessScope(
  classroomId: string
): Promise<ClassroomAccessScope | null> {
  const scope = await classroomStorage.resolveClassroomPolicyScope(classroomId);
  if (!scope) {
    return null;
  }

  return {
    id: scope.classroomId,
    name: scope.classroomName,
    displayName: scope.classroomDisplayName,
    defaultGroupId: scope.defaultGroupId,
    activeGroupId: scope.activeGroupId,
    currentGroupId: scope.currentGroupId,
    currentGroupSource: normalizeCurrentGroupSource(scope.currentGroupSource),
  };
}

function canUseClassroomScope(
  user: JWTPayload,
  scope: ClassroomAccessScope,
  purpose: ClassroomAccessPurpose
): boolean {
  if (purpose === 'enroll' && scope.currentGroupSource === 'none') {
    return true;
  }

  return canAccessClassroomScope(user, scope);
}

async function ensureUserCanUseClassroom(
  user: JWTPayload,
  classroomId: string,
  purpose: ClassroomAccessPurpose
): Promise<ClassroomAccessResult> {
  const scope = await resolveClassroomAccessScope(classroomId);
  if (!scope) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Classroom not found' } };
  }

  if (!canUseClassroomScope(user, scope, purpose)) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You do not have access to this classroom' },
    };
  }

  return { ok: true, data: scope };
}

export async function ensureUserCanAccessClassroom(
  user: JWTPayload,
  classroomId: string
): Promise<ClassroomAccessResult> {
  return ensureUserCanUseClassroom(user, classroomId, 'view');
}

export async function ensureUserCanEnrollClassroom(
  user: JWTPayload,
  classroomId: string
): Promise<ClassroomAccessResult> {
  return ensureUserCanUseClassroom(user, classroomId, 'enroll');
}

/**
 * List all classrooms with their machine counts and current state
 */
export async function listClassrooms(user?: JWTPayload): Promise<ClassroomWithMachines[]> {
  const classrooms = await classroomStorage.getAllClassrooms();
  const now = new Date();
  const [machinesByClassroomId, scopeByClassroomId] = await Promise.all([
    classroomStorage.getMachinesByClassroomIds(classrooms.map((classroom) => classroom.id)),
    classroomStorage.resolveClassroomPolicyScopesForClassrooms(classrooms, now),
  ]);

  const result = classrooms.map((c) => {
    const rawMachines = machinesByClassroomId.get(c.id) ?? [];
    const machines: MachineInfo[] = rawMachines.map((m) => ({
      id: m.id,
      hostname: m.hostname,
      lastSeen: m.lastSeen?.toISOString() ?? null,
      status: calculateMachineStatus(m.lastSeen),
    }));

    const scope = scopeByClassroomId.get(c.id);

    // Calculate classroom status based on machine health
    const status = calculateClassroomStatus(machines);
    const onlineMachineCount = machines.filter((m) => m.status === 'online').length;

    return {
      id: c.id,
      name: c.name,
      displayName: c.displayName,
      defaultGroupId: c.defaultGroupId,
      activeGroupId: c.activeGroupId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      currentGroupId: scope?.currentGroupId ?? null,
      currentGroupSource: normalizeCurrentGroupSource(scope?.currentGroupSource),
      machines,
      machineCount: machines.length,
      status,
      onlineMachineCount,
    };
  });

  if (!user || auth.isAdminToken(user)) {
    return result;
  }

  return result.filter((classroom) => canAccessClassroomScope(user, classroom));
}

/**
 * Get a specific classroom with its machines and current state
 */
export async function getClassroom(
  id: string,
  user?: JWTPayload
): Promise<ClassroomResult<ClassroomWithMachines>> {
  const classroom = await classroomStorage.getClassroomById(id);
  if (!classroom)
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Classroom not found' } };

  const rawMachines = await classroomStorage.getMachinesByClassroom(id);
  const machines: MachineInfo[] = rawMachines.map((m) => ({
    id: m.id,
    hostname: m.hostname,
    lastSeen: m.lastSeen?.toISOString() ?? null,
    status: calculateMachineStatus(m.lastSeen),
  }));
  const scope = await classroomStorage.resolveClassroomPolicyScope(id);

  // Calculate classroom status based on machine health
  const status = calculateClassroomStatus(machines);
  const onlineMachineCount = machines.filter((m) => m.status === 'online').length;

  const result: ClassroomWithMachines = {
    id: classroom.id,
    name: classroom.name,
    displayName: classroom.displayName,
    defaultGroupId: classroom.defaultGroupId,
    activeGroupId: classroom.activeGroupId,
    createdAt: (classroom.createdAt ?? new Date()).toISOString(),
    updatedAt: (classroom.updatedAt ?? new Date()).toISOString(),
    currentGroupId: scope?.currentGroupId ?? null,
    currentGroupSource: normalizeCurrentGroupSource(scope?.currentGroupSource),
    machines,
    machineCount: machines.length,
    status,
    onlineMachineCount,
  };

  if (user && !canAccessClassroomScope(user, result)) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You do not have access to this classroom' },
    };
  }

  return {
    ok: true,
    data: result,
  };
}

/**
 * Register a machine to a classroom
 */
export async function registerMachine(
  input: RegisterMachineInput
): Promise<ClassroomResult<MachineRegistrationResult>> {
  // Validate hostname
  if (!input.hostname || input.hostname.trim() === '') {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'Hostname required' },
    };
  }

  // Resolve classroom ID
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

  // Register the machine
  const machine = await classroomStorage.registerMachine({
    hostname: machineHostname,
    reportedHostname,
    classroomId: classroom.id,
    ...(input.version ? { version: input.version } : {}),
  });

  // Type the result properly
  const result: MachineRegistrationResult = {
    // Preserve the human-readable hostname for clients; the persisted identity is canonicalized.
    hostname: machine.reportedHostname ?? reportedHostname,
    classroomId: machine.classroomId ?? classroom.id,
    classroomName: classroom.name,
    lastSeen: machine.lastSeen?.toISOString() ?? new Date().toISOString(),
    ...(machine.version !== null && { version: machine.version }),
  };

  return {
    ok: true,
    data: result,
  };
}

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
  user: JWTPayload,
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

export async function createExemptionForClassroom(
  user: JWTPayload,
  input: CreateMachineExemptionInput
): Promise<ClassroomResult<MachineExemptionInfo>> {
  const access = await ensureUserCanAccessClassroom(user, input.classroomId);
  if (!access.ok) {
    return access;
  }

  try {
    const created = await createMachineExemption({
      machineId: input.machineId,
      classroomId: input.classroomId,
      scheduleId: input.scheduleId,
      createdBy: input.createdBy,
    });

    DomainEventsService.publishClassroomChanged(input.classroomId);

    return {
      ok: true,
      data: {
        id: created.id,
        machineId: created.machineId,
        classroomId: created.classroomId,
        scheduleId: created.scheduleId,
        createdBy: created.createdBy ?? null,
        createdAt: created.createdAt ? created.createdAt.toISOString() : null,
        expiresAt: created.expiresAt.toISOString(),
      },
    };
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
  user: JWTPayload,
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

  const deleted = await deleteMachineExemption(exemptionId);
  if (!deleted) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Exemption not found' } };
  }

  DomainEventsService.publishClassroomChanged(deleted.classroomId);
  return { ok: true, data: { success: true } };
}

export async function listExemptionsForClassroom(
  user: JWTPayload,
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
      exemptions: rows.map((entry) => ({
        id: entry.id,
        machineId: entry.machineId,
        machineHostname: entry.machineHostname,
        classroomId: entry.classroomId,
        scheduleId: entry.scheduleId,
        createdBy: entry.createdBy,
        createdAt: entry.createdAt ? entry.createdAt.toISOString() : null,
        expiresAt: entry.expiresAt.toISOString(),
      })),
    },
  };
}

export async function deleteClassroom(id: string): Promise<ClassroomResult<{ success: true }>> {
  if (!(await classroomStorage.deleteClassroom(id))) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Classroom not found' } };
  }

  return { ok: true, data: { success: true } };
}

export async function getStats(): Promise<Awaited<ReturnType<typeof classroomStorage.getStats>>> {
  return await classroomStorage.getStats();
}

export async function deleteMachine(hostname: string): Promise<ClassroomResult<{ success: true }>> {
  if (!(await classroomStorage.deleteMachine(hostname))) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Machine not found' } };
  }

  return { ok: true, data: { success: true } };
}

export async function listMachines(classroomId?: string): Promise<ClassroomMachineListItem[]> {
  const allMachines = await classroomStorage.getAllMachines(classroomId);
  return allMachines.map((machine) => ({
    id: machine.id,
    hostname: machine.hostname,
    classroomId: machine.classroomId,
    version: machine.version,
    lastSeen: machine.lastSeen?.toISOString() ?? null,
    hasDownloadToken: machine.downloadTokenHash !== null,
    downloadTokenLastRotatedAt: machine.downloadTokenLastRotatedAt?.toISOString() ?? null,
  }));
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

// =============================================================================
// Default Export
// =============================================================================

export default {
  createClassroom,
  updateClassroom,
  setClassroomActiveGroup,
  createExemptionForClassroom,
  deleteExemptionForClassroom,
  listExemptionsForClassroom,
  deleteClassroom,
  getStats,
  deleteMachine,
  listMachines,
  rotateMachineToken,
  registerMachine,
  listClassrooms,
  getClassroom,
  ensureUserCanAccessClassroom,
  ensureUserCanEnrollClassroom,
};
