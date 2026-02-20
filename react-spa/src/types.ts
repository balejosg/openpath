import React from 'react';

export enum UserRole {
  ADMIN = 'admin',
  TEACHER = 'teacher',
  STUDENT = 'student',
  NO_ROLES = 'no roles',
}

export interface User {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
  status: 'Active' | 'Inactive';
}

export type ClassroomStatus = 'operational' | 'degraded' | 'offline';

export type CurrentGroupSource = 'manual' | 'schedule' | 'default' | 'none';

export interface Classroom {
  id: string;
  name: string;
  displayName: string;
  defaultGroupId: string | null;
  computerCount: number;
  activeGroup: string | null;
  currentGroupId: string | null;
  currentGroupSource?: CurrentGroupSource;
  status: ClassroomStatus;
  onlineMachineCount: number;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  domainCount: number;
  status: 'Active' | 'Inactive';
}

export interface GroupData {
  enabled: boolean;
  whitelist: string[];
  blockedSubdomains: string[];
  blockedPaths: string[];
}

export interface Schedule {
  id: string;
  classroomId: string;
  dayOfWeek: number; // 1=Mon … 5=Fri
  startTime: string; // "HH:MM"
  endTime: string;
  groupId: string;
  teacherId: string;
  recurrence?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ScheduleWithPermissions extends Schedule {
  isMine: boolean;
  canEdit: boolean;
}

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}
