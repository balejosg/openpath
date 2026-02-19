/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * API Type Definitions
 * Re-exports shared types + API-specific types (JWT, Express, Config)
 */

// =============================================================================
// Re-export from @openpath/shared (single source of truth)
// =============================================================================

export {
  // Zod Schemas (for runtime validation)
  RequestStatus as RequestStatusSchema,
  RequestPriority as RequestPrioritySchema,
  UserRole as UserRoleSchema,
  MachineStatus as MachineStatusSchema,
  HealthStatus as HealthStatusSchema,
  DomainRequest as DomainRequestSchema,
  User as UserSchema,
  SafeUser as SafeUserSchema,
  SafeUserWithRoles as SafeUserWithRolesSchema,
  AuthUser as AuthUserSchema,
  Role as RoleSchema,
  RoleInfo as RoleInfoSchema,
  Classroom as ClassroomSchema,
  Machine as MachineSchema,
  Schedule as ScheduleSchema,
  HealthReport as HealthReportSchema,
  PushSubscription as PushSubscriptionSchema,
  CreateRequestDTO as CreateRequestDTOSchema,
  UpdateRequestStatusDTO as UpdateRequestStatusDTOSchema,
  CreateUserDTO as CreateUserDTOSchema,
  LoginDTO as LoginDTOSchema,
  CreateClassroomDTO as CreateClassroomDTOSchema,
  CreateScheduleDTO as CreateScheduleDTOSchema,
  CreatePushSubscriptionDTO as CreatePushSubscriptionDTOSchema,
  getErrorMessage,
  normalize,
} from '@openpath/shared';

export type {
  // Types (inferred from Zod)
  RequestStatus,
  RequestPriority,
  UserRole,
  MachineStatus,
  HealthStatus,
  DomainRequest,
  User,
  SafeUser,
  SafeUserWithRoles,
  AuthUser,
  Role,
  RoleInfo,
  Classroom,
  Machine,
  Schedule,
  HealthReport,
  PushSubscription,
  // DTO Types
  CreateRequestDTO,
  UpdateRequestStatusDTO,
  CreateUserDTO,
  LoginDTO,
  CreateClassroomDTO,
  CreateScheduleDTO,
  PushSubscriptionKeys,
  CreatePushSubscriptionDTO,
  // Response types
  APIResponseType,
  PaginatedResponse,
} from '@openpath/shared';

// Backwards compatibility alias
export type APIResponse<T = unknown> = import('@openpath/shared').APIResponseType<T>;

// =============================================================================
// JWT Types (API-specific)
// =============================================================================

import type { RoleInfo } from '@openpath/shared';

/**
 * JWT token payload - matches auth.ts implementation
 */
export interface JWTPayload {
  sub: string; // user id
  email: string;
  name: string;
  roles: RoleInfo[];
  type: 'access' | 'refresh';
  isLegacy?: boolean;
  iat?: number;
  exp?: number;
}

/**
 * Decoded and validated JWT token
 */
export interface DecodedToken extends JWTPayload {
  isAdmin: boolean;
}

// =============================================================================
// API-specific Response Types
// =============================================================================

import type { AuthUser } from '@openpath/shared';

/**
 * Statistics response
 */
export interface StatsResponse {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

/**
 * Login response
 */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

// =============================================================================
// Express Extensions (API-specific)
// =============================================================================

import type { Request, Response, NextFunction } from 'express';

/**
 * Request with authenticated user
 */
export interface AuthenticatedRequest extends Request {
  user: DecodedToken;
  requestId?: string;
}

/**
 * Request with user's accessible groups
 */
export interface RequestWithGroups extends AuthenticatedRequest {
  userGroups: string[] | 'all';
}

/**
 * Express middleware type
 */
export type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

/**
 * Authenticated middleware type
 */
export type AuthMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => void | Promise<void>;

// =============================================================================
// Configuration Types (API-specific)
// =============================================================================

/**
 * Environment configuration
 */
export interface Config {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshExpiresIn: string;
  adminToken?: string;
  sharedSecret?: string;
  corsOrigins: string;
  dataDir: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidEmail?: string;
}
