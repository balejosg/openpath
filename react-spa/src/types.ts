import React from 'react';

export enum UserRole {
  ADMIN = 'admin',
  OPENPATH_ADMIN = 'openpath-admin',
  USER = 'user',
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

export interface Classroom {
  id: string;
  name: string;
  computerCount: number;
  activeGroup: string | null;
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

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}
