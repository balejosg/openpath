/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Storage Interface Definitions
 */

import type {
  DomainRequest,
  RequestStatus,
  RequestPriority,
  User,
  SafeUser,
  Role,
  UserRole,
  Classroom,
  Machine,
  Schedule,
  PushSubscription,
  CreateRequestDTO,
  CreateUserDTO,
  CreateClassroomDTO,
  CreateScheduleDTO,
  CreatePushSubscriptionDTO,
} from './index.js';

// Local type aliases for internal use (resolves scope errors)
export type CreateRequestData = CreateRequestDTO;
export type CreateUserData = CreateUserDTO;
export type CreateClassroomData = CreateClassroomDTO;
export type CreateScheduleData = CreateScheduleDTO;
export type CreatePushSubscriptionData = CreatePushSubscriptionDTO;

// Re-export all types as named exports for external consumers
export type {
  DomainRequest,
  RequestStatus,
  RequestPriority,
  User,
  SafeUser,
  Role,
  UserRole,
  Classroom,
  Machine,
  Schedule,
  PushSubscription,
};

// =============================================================================
// Request Storage
// =============================================================================

/**
 * Request statistics
 */
export interface RequestStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

/**
 * Request storage interface
 */
export interface IRequestStorage {
  getAllRequests(status?: RequestStatus | null): Promise<DomainRequest[]>;
  getRequestById(id: string): Promise<DomainRequest | null>;
  getRequestsByGroup(groupId: string): Promise<DomainRequest[]>;
  hasPendingRequest(domain: string): Promise<boolean>;
  createRequest(data: CreateRequestData): Promise<DomainRequest>;
  updateRequestStatus(
    id: string,
    status: 'approved' | 'rejected',
    resolvedBy?: string,
    note?: string | null
  ): Promise<DomainRequest | null>;
  deleteRequest(id: string): Promise<boolean>;
  getStats(): Promise<RequestStats>;
}

// =============================================================================
// User Storage
// =============================================================================

/**
 * Data for updating a user
 */
export interface UpdateUserData {
  email?: string | undefined;
  name?: string | undefined;
  password?: string | undefined;
  active?: boolean | undefined;
}

/**
 * User storage interface
 */
export interface IUserStorage {
  getAllUsers(): Promise<SafeUser[]>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  createUser(data: CreateUserData): Promise<SafeUser>;
  updateUser(id: string, data: UpdateUserData): Promise<SafeUser | null>;
  deleteUser(id: string): Promise<boolean>;
  verifyPassword(user: User, password: string): Promise<boolean>;
}

// =============================================================================
// Role Storage
// =============================================================================

/**
 * Data for assigning a role
 */
export interface AssignRoleData {
  userId: string;
  role: UserRole;
  groupIds: string[];
  expiresAt?: string | null;
}

/**
 * Role storage interface
 */
export interface IRoleStorage {
  getRolesByUser(userId: string): Promise<Role[]>;
  getRoleById(roleId: string): Promise<Role | null>;
  getUsersWithRole(role: UserRole): Promise<string[]>;
  assignRole(data: AssignRoleData): Promise<Role>;
  updateRole(roleId: string, data: Partial<Role>): Promise<Role | null>;
  revokeRole(roleId: string): Promise<boolean>;
  revokeAllUserRoles(userId: string): Promise<number>;
}

// =============================================================================
// Classroom Storage
// =============================================================================

/**
 * Data for updating a classroom
 */
export interface UpdateClassroomData {
  name?: string | undefined;
  displayName?: string | undefined;
}

/**
 * Classroom storage interface
 */
export interface IClassroomStorage {
  getAllClassrooms(): Promise<Classroom[]>;
  getClassroomById(id: string): Promise<Classroom | null>;
  getClassroomByName(name: string): Promise<Classroom | null>;
  createClassroom(data: CreateClassroomData): Promise<Classroom>;
  updateClassroom(id: string, data: UpdateClassroomData): Promise<Classroom | null>;
  deleteClassroom(id: string): Promise<boolean>;
  addMachine(classroomId: string, hostname: string): Promise<Machine | null>;
  removeMachine(classroomId: string, hostname: string): Promise<boolean>;
  getMachineByHostname(
    hostname: string
  ): Promise<{ classroom: Classroom; machine: Machine } | null>;
  updateMachineStatus(hostname: string, status: 'online' | 'offline'): Promise<boolean>;
}

// =============================================================================
// Schedule Storage
// =============================================================================

/**
 * Data for updating a schedule
 */
export interface UpdateScheduleData {
  dayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime?: string;
  endTime?: string;
  groupId?: string;
  subject?: string;
  active?: boolean;
}

/**
 * Schedule conflict info
 */
export interface ScheduleConflict {
  conflictingSchedule: Schedule;
  reason: string;
}

/**
 * Schedule storage interface
 */
export interface IScheduleStorage {
  getAllSchedules(): Promise<Schedule[]>;
  getScheduleById(id: string): Promise<Schedule | null>;
  getSchedulesByClassroom(classroomId: string): Promise<Schedule[]>;
  getSchedulesByTeacher(teacherId: string): Promise<Schedule[]>;
  createSchedule(data: CreateScheduleData): Promise<Schedule>;
  updateSchedule(id: string, data: UpdateScheduleData): Promise<Schedule | null>;
  deleteSchedule(id: string): Promise<boolean>;
  getCurrentSchedule(classroomId: string): Promise<Schedule | null>;
  checkConflict(
    classroomId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    excludeId?: string
  ): Promise<ScheduleConflict | null>;
}

// =============================================================================
// Token Store
// =============================================================================

/**
 * Token store interface for blacklisting
 */
export interface ITokenStore {
  blacklist(token: string, expiresAt: Date): Promise<void>;
  isBlacklisted(token: string): Promise<boolean>;
  cleanup(): Promise<number>;
}

// =============================================================================
// Push Subscription Storage
// =============================================================================

/**
 * Data for creating a push subscription
 */

/**
 * Push subscription storage interface
 */
export interface IPushStorage {
  getSubscriptionsByUser(userId: string): PushSubscription[];
  getSubscriptionsByGroup(groupId: string): PushSubscription[];
  getAllSubscriptions(): PushSubscription[];
  createSubscription(data: CreatePushSubscriptionData): PushSubscription;
  deleteSubscription(endpoint: string): boolean;
  deleteUserSubscriptions(userId: string): number;
}
