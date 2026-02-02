export type { AppRouter } from './trpc/routers/index.js';

// Drizzle tables (for queries)
export {
  users,
  roles,
  requests,
  classrooms,
  machines,
  schedules,
  tokens,
  settings,
  pushSubscriptions,
  healthReports,
  whitelistGroups,
  whitelistRules,
  dashboardUsers,
} from './db/schema.js';

// Drizzle inferred types for DB operations
export type {
  User,
  Role,
  Request,
  Classroom,
  Machine,
  Schedule,
  Token,
  Setting,
  PushSubscription,
  HealthReport,
  WhitelistGroup,
  WhitelistRule,
  DashboardUser,
  NewUser,
  NewRole,
  NewRequest,
  NewClassroom,
  NewMachine,
  NewSchedule,
  NewToken,
  NewSetting,
  NewPushSubscription,
  NewHealthReport,
  NewWhitelistGroup,
  NewWhitelistRule,
} from './db/schema.js';

// Re-export domain types from shared (single source of truth)
export * from '@openpath/shared';

// API-specific types (Express, JWT, Config)
export type {
  JWTPayload,
  DecodedToken,
  AuthenticatedRequest,
  RequestWithGroups,
  Middleware,
  AuthMiddleware,
  Config,
  LoginResponse,
  StatsResponse,
} from './types/index.js';
