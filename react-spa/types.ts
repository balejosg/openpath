import React from 'react';

export enum UserRole {
  ADMIN = 'admin',
  OPENPATH_ADMIN = 'openpath-admin',
  USER = 'user',
  NO_ROLES = 'no roles',
}

// Note: This User type is for display purposes in the UI.
// The auth.ts User type is the canonical type for authentication.
// API returns roles as an array of objects with { role, groupIds? }
export interface User {
  id: string;
  name: string;
  email: string;
  roles: {
    role: 'admin' | 'teacher' | 'student' | 'user';
    groupIds?: string[];
  }[];
  isActive?: boolean;
}

export interface Classroom {
  id: string;
  name: string;
  computerCount: number;
  activeGroup: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  domainCount: number;
  status: 'Active' | 'Inactive';
}

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}
