/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * SetupService - Business logic for initial system setup
 *
 * This service extracts the shared logic from REST endpoints and tRPC routers
 * to eliminate duplication and provide a single source of truth.
 */

import { logger } from '../lib/logger.js';
import { createFirstAdmin, regenerateToken } from './setup-management.service.js';
import { getRegistrationToken, getStatus, validateToken } from './setup-query.service.js';
export type {
  CreateFirstAdminInput,
  CreateFirstAdminResult,
  SetupResult,
  SetupServiceError,
  SetupStatus,
} from './setup-service-shared.js';
export { createFirstAdmin, regenerateToken } from './setup-management.service.js';
export { getRegistrationToken, getStatus, validateToken } from './setup-query.service.js';

logger.debug('SetupService initialized');

export const SetupService = {
  getStatus,
  createFirstAdmin,
  validateToken,
  getRegistrationToken,
  regenerateToken,
};

export default SetupService;
