/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * ClassroomService - Business logic for classroom and machine management
 */

import * as classroomStorage from '../lib/classroom-storage.js';
import * as scheduleStorage from '../lib/schedule-storage.js';

// =============================================================================
// Types
// =============================================================================

export interface RegisterMachineInput {
  hostname: string;
  classroomId?: string | undefined;
  classroomName?: string | undefined;
  version?: string | undefined;
}

export type MachineStatus = 'online' | 'stale' | 'offline';
export type ClassroomStatus = 'operational' | 'degraded' | 'offline';

export interface MachineInfo {
  hostname: string;
  lastSeen: string | null;
  status: MachineStatus;
}

// Thresholds for machine status (in minutes)
const ONLINE_THRESHOLD_MINUTES = 5;
const STALE_THRESHOLD_MINUTES = 15;

/**
 * Calculate machine status based on lastSeen timestamp
 */
function calculateMachineStatus(lastSeen: Date | null): MachineStatus {
  if (!lastSeen) return 'offline';

  const now = new Date();
  const diffMs = now.getTime() - lastSeen.getTime();
  const diffMinutes = diffMs / (1000 * 60);

  if (diffMinutes <= ONLINE_THRESHOLD_MINUTES) return 'online';
  if (diffMinutes <= STALE_THRESHOLD_MINUTES) return 'stale';
  return 'offline';
}

/**
 * Calculate classroom status based on machine statuses
 */
function calculateClassroomStatus(machines: MachineInfo[]): ClassroomStatus {
  if (machines.length === 0) return 'operational'; // No machines = operational by default

  const onlineCount = machines.filter((m) => m.status === 'online').length;
  const offlineCount = machines.filter((m) => m.status === 'offline').length;

  if (onlineCount === machines.length) return 'operational';
  if (offlineCount === machines.length) return 'offline';
  return 'degraded';
}

export interface MachineRegistrationResult {
  hostname: string;
  classroomId: string;
  classroomName: string;
  version?: string;
  lastSeen: string;
}

export interface ClassroomWithMachines {
  id: string;
  name: string;
  displayName: string;
  defaultGroupId: string | null;
  activeGroupId: string | null;
  createdAt: string;
  updatedAt: string;
  currentGroupId: string | null;
  machines: MachineInfo[];
  machineCount: number;
  status: ClassroomStatus;
  onlineMachineCount: number;
}

export interface UpdateClassroomData {
  name?: string;
  displayName?: string;
  defaultGroupId?: string;
  activeGroupId?: string;
}

// Use standard tRPC error codes for easy mapping
export type ClassroomServiceError =
  | { code: 'BAD_REQUEST'; message: string }
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'CONFLICT'; message: string }
  | { code: 'INTERNAL_SERVER_ERROR'; message: string };

export type ClassroomResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ClassroomServiceError };

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * List all classrooms with their machine counts and current state
 */
export async function listClassrooms(): Promise<ClassroomWithMachines[]> {
  const classrooms = await classroomStorage.getAllClassrooms();
  return Promise.all(
    classrooms.map(async (c) => {
      const rawMachines = await classroomStorage.getMachinesByClassroom(c.id);
      const machines: MachineInfo[] = rawMachines.map((m) => ({
        hostname: m.hostname,
        lastSeen: m.lastSeen?.toISOString() ?? null,
        status: calculateMachineStatus(m.lastSeen),
      }));

      // Use schedule service for current group
      const currentSchedule = await scheduleStorage.getCurrentSchedule(c.id);
      const currentGroupId = c.activeGroupId ?? currentSchedule?.groupId ?? c.defaultGroupId;

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
        currentGroupId,
        machines,
        machineCount: machines.length,
        status,
        onlineMachineCount,
      };
    })
  );
}

/**
 * Get a specific classroom with its machines and current state
 */
export async function getClassroom(id: string): Promise<ClassroomResult<ClassroomWithMachines>> {
  const classroom = await classroomStorage.getClassroomById(id);
  if (!classroom)
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Classroom not found' } };

  const rawMachines = await classroomStorage.getMachinesByClassroom(id);
  const machines: MachineInfo[] = rawMachines.map((m) => ({
    hostname: m.hostname,
    lastSeen: m.lastSeen?.toISOString() ?? null,
    status: calculateMachineStatus(m.lastSeen),
  }));

  const currentSchedule = await scheduleStorage.getCurrentSchedule(id);
  const currentGroupId =
    classroom.activeGroupId ?? currentSchedule?.groupId ?? classroom.defaultGroupId;

  // Calculate classroom status based on machine health
  const status = calculateClassroomStatus(machines);
  const onlineMachineCount = machines.filter((m) => m.status === 'online').length;

  return {
    ok: true,
    data: {
      id: classroom.id,
      name: classroom.name,
      displayName: classroom.displayName,
      defaultGroupId: classroom.defaultGroupId,
      activeGroupId: classroom.activeGroupId,
      createdAt: (classroom.createdAt ?? new Date()).toISOString(),
      updatedAt: (classroom.updatedAt ?? new Date()).toISOString(),
      currentGroupId,
      machines,
      machineCount: machines.length,
      status,
      onlineMachineCount,
    },
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

  // Register the machine
  const machine = await classroomStorage.registerMachine({
    hostname: input.hostname,
    classroomId,
    ...(input.version ? { version: input.version } : {}),
  });

  // Get classroom name
  const classroom = await classroomStorage.getClassroomById(classroomId);

  // Type the result properly
  const result: MachineRegistrationResult = {
    hostname: machine.hostname,
    classroomId: machine.classroomId ?? classroomId,
    classroomName: classroom?.name ?? '',
    lastSeen: machine.lastSeen?.toISOString() ?? new Date().toISOString(),
    ...(machine.version !== null && { version: machine.version }),
  };

  return {
    ok: true,
    data: result,
  };
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  registerMachine,
  listClassrooms,
  getClassroom,
};
