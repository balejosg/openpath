import type { JWTPayload } from '../lib/auth.js';
import * as roleStorage from '../lib/role-storage.js';
import { logger } from '../lib/logger.js';
import { normalizeUserRoleString } from '@openpath/shared/roles';

export async function syncJwtRolesFromDb(user: JWTPayload): Promise<JWTPayload> {
  try {
    const dbRoles = await roleStorage.getUserRoles(user.sub);
    const normalizedRoles: JWTPayload['roles'] = [];

    for (const roleInfo of dbRoles) {
      const role = normalizeUserRoleString(roleInfo.role);
      if (!role) continue;
      normalizedRoles.push({ role, groupIds: roleInfo.groupIds ?? [] });
    }

    if (normalizedRoles.length === 0) {
      return user;
    }

    return {
      ...user,
      roles: normalizedRoles,
    } as JWTPayload;
  } catch (error) {
    logger.warn('Failed to sync user roles from DB', {
      userId: user.sub,
      error: error instanceof Error ? error.message : String(error),
    });
    return user;
  }
}

export default {
  syncJwtRolesFromDb,
};
