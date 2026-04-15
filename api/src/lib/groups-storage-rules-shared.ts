import { and, eq } from 'drizzle-orm';
import { normalize } from '@openpath/shared';
import { db, whitelistRules } from '../db/index.js';
import type { DbExecutor } from '../db/index.js';
import type { RuleType } from './groups-storage-shared.js';

export function normalizeRuleValue(type: RuleType, value: string): string {
  return type === 'blocked_path' ? value.trim() : normalize.domain(value);
}

export async function listRuleRowsByGroup(
  groupId: string,
  type?: RuleType,
  executor: DbExecutor = db
) {
  if (type) {
    return executor
      .select()
      .from(whitelistRules)
      .where(and(eq(whitelistRules.groupId, groupId), eq(whitelistRules.type, type)));
  }

  return executor.select().from(whitelistRules).where(eq(whitelistRules.groupId, groupId));
}
