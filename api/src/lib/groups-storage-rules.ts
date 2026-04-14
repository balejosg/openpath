import { v4 as uuidv4 } from 'uuid';
import { and, eq, inArray } from 'drizzle-orm';
import { getRootDomain, normalize } from '@openpath/shared';
import { db, whitelistRules } from '../db/index.js';
import type { DbExecutor } from '../db/index.js';
import { getRowCount } from './utils.js';
import { logger } from './logger.js';
import {
  dbRuleToApi,
  type CreateRuleResult,
  type DomainGroup,
  type ListRulesGroupedOptions,
  type ListRulesOptions,
  type PaginatedGroupedRulesResult,
  type PaginatedRulesResult,
  type Rule,
  type RuleSource,
  type RuleType,
  type UpdateRuleInput,
} from './groups-storage-shared.js';
import { touchGroupUpdatedAt } from './groups-storage-groups.js';

export async function copyRulesToGroup(
  params: {
    fromGroupId: string;
    toGroupId: string;
  },
  executor: DbExecutor = db
): Promise<number> {
  const source = await executor
    .select()
    .from(whitelistRules)
    .where(eq(whitelistRules.groupId, params.fromGroupId));

  if (source.length === 0) return 0;

  const batchSize = 500;
  let inserted = 0;
  for (let index = 0; index < source.length; index += batchSize) {
    const batch = source.slice(index, index + batchSize).map((rule) => ({
      id: uuidv4(),
      groupId: params.toGroupId,
      type: rule.type,
      value: rule.value,
      source: (rule.source as RuleSource | null) ?? 'manual',
      comment: rule.comment ?? null,
    }));

    await executor.insert(whitelistRules).values(batch);
    inserted += batch.length;
  }

  return inserted;
}

export async function getRulesByGroup(groupId: string, type?: RuleType): Promise<Rule[]> {
  let rules;
  if (type) {
    rules = await db
      .select()
      .from(whitelistRules)
      .where(and(eq(whitelistRules.groupId, groupId), eq(whitelistRules.type, type)));
  } else {
    rules = await db.select().from(whitelistRules).where(eq(whitelistRules.groupId, groupId));
  }

  return rules.map(dbRuleToApi).sort((left, right) => left.value.localeCompare(right.value));
}

export async function getRulesByGroupPaginated(
  options: ListRulesOptions
): Promise<PaginatedRulesResult> {
  const { groupId, type, limit = 50, offset = 0, search } = options;

  let rules;
  if (type) {
    rules = await db
      .select()
      .from(whitelistRules)
      .where(and(eq(whitelistRules.groupId, groupId), eq(whitelistRules.type, type)));
  } else {
    rules = await db.select().from(whitelistRules).where(eq(whitelistRules.groupId, groupId));
  }

  let filtered = rules;
  if (search?.trim()) {
    const searchLower = search.toLowerCase().trim();
    filtered = rules.filter((rule) => rule.value.toLowerCase().includes(searchLower));
  }

  filtered.sort((left, right) => left.value.localeCompare(right.value));

  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  return {
    rules: paginated.map(dbRuleToApi),
    total,
    hasMore: offset + limit < total,
  };
}

export async function getRulesByGroupGrouped(
  options: ListRulesGroupedOptions
): Promise<PaginatedGroupedRulesResult> {
  const { groupId, type, limit = 20, offset = 0, search } = options;

  let rules;
  if (type) {
    rules = await db
      .select()
      .from(whitelistRules)
      .where(and(eq(whitelistRules.groupId, groupId), eq(whitelistRules.type, type)));
  } else {
    rules = await db.select().from(whitelistRules).where(eq(whitelistRules.groupId, groupId));
  }

  let filtered = rules;
  if (search?.trim()) {
    const searchLower = search.toLowerCase().trim();
    filtered = rules.filter((rule) => rule.value.toLowerCase().includes(searchLower));
  }

  const groupedMap = new Map<string, typeof filtered>();
  for (const rule of filtered) {
    const root = getRootDomain(rule.value);
    const existing = groupedMap.get(root) ?? [];
    existing.push(rule);
    groupedMap.set(root, existing);
  }

  const sortedRoots = Array.from(groupedMap.keys()).sort((left, right) =>
    left.localeCompare(right)
  );
  const totalGroups = sortedRoots.length;
  const totalRules = filtered.length;
  const paginatedRoots = sortedRoots.slice(offset, offset + limit);

  const groups: DomainGroup[] = paginatedRoots.map((root) => {
    const groupRules = groupedMap.get(root) ?? [];
    groupRules.sort((left, right) => left.value.localeCompare(right.value));

    const hasWhitelist = groupRules.some((rule) => rule.type === 'whitelist');
    const hasBlocked = groupRules.some(
      (rule) => rule.type === 'blocked_subdomain' || rule.type === 'blocked_path'
    );

    const status: DomainGroup['status'] =
      hasWhitelist && hasBlocked ? 'mixed' : hasBlocked ? 'blocked' : 'allowed';

    return {
      root,
      rules: groupRules.map(dbRuleToApi),
      status,
    };
  });

  return {
    groups,
    totalGroups,
    totalRules,
    hasMore: offset + limit < totalGroups,
  };
}

export async function getRuleById(id: string): Promise<Rule | null> {
  const [rule] = await db.select().from(whitelistRules).where(eq(whitelistRules.id, id));
  if (!rule) return null;
  return dbRuleToApi(rule);
}

export async function getRulesByIds(ids: string[]): Promise<Rule[]> {
  if (ids.length === 0) return [];

  const uniqueIds = Array.from(new Set(ids));
  const rows = await db.select().from(whitelistRules).where(inArray(whitelistRules.id, uniqueIds));

  if (rows.length === 0) return [];

  const rulesById = new Map<string, Rule>();
  for (const row of rows) {
    rulesById.set(row.id, dbRuleToApi(row));
  }

  const ordered: Rule[] = [];
  for (const id of ids) {
    const rule = rulesById.get(id);
    if (rule) ordered.push(rule);
  }

  return ordered;
}

export async function updateRule(
  input: UpdateRuleInput,
  executor: DbExecutor = db
): Promise<Rule | null> {
  const { id, value, comment } = input;
  const [existing] = await executor.select().from(whitelistRules).where(eq(whitelistRules.id, id));
  if (!existing) return null;

  const updates: Partial<{ value: string; comment: string | null }> = {};

  if (value !== undefined) {
    const normalizedValue =
      existing.type === 'blocked_path' ? value.trim() : normalize.domain(value);

    const [duplicate] = await executor
      .select()
      .from(whitelistRules)
      .where(
        and(
          eq(whitelistRules.groupId, existing.groupId),
          eq(whitelistRules.type, existing.type),
          eq(whitelistRules.value, normalizedValue)
        )
      );

    if (duplicate && duplicate.id !== id) {
      return null;
    }

    updates.value = normalizedValue;
  }

  if (comment !== undefined) {
    updates.comment = comment;
  }

  if (Object.keys(updates).length > 0) {
    await executor.update(whitelistRules).set(updates).where(eq(whitelistRules.id, id));
    await touchGroupUpdatedAt(existing.groupId, executor);
    logger.debug('Updated rule', { id, ...updates });
  }

  return await getRuleById(id);
}

export async function createRule(
  groupId: string,
  type: RuleType,
  value: string,
  comment: string | null = null,
  source: RuleSource = 'manual',
  executor: DbExecutor = db
): Promise<CreateRuleResult> {
  const normalizedValue = type === 'blocked_path' ? value.trim() : normalize.domain(value);

  const [existing] = await executor
    .select()
    .from(whitelistRules)
    .where(
      and(
        eq(whitelistRules.groupId, groupId),
        eq(whitelistRules.type, type),
        eq(whitelistRules.value, normalizedValue)
      )
    );

  if (existing) {
    return { success: false, error: 'Rule already exists' };
  }

  const id = uuidv4();
  await executor.insert(whitelistRules).values({
    id,
    groupId,
    type,
    value: normalizedValue,
    source,
    comment,
  });

  await touchGroupUpdatedAt(groupId, executor);
  logger.debug('Created rule', { id, groupId, type, value: normalizedValue, source });
  return { success: true, id };
}

export async function deleteRule(id: string, executor: DbExecutor = db): Promise<boolean> {
  const [existing] = await executor.select().from(whitelistRules).where(eq(whitelistRules.id, id));
  const deleted =
    getRowCount(await executor.delete(whitelistRules).where(eq(whitelistRules.id, id))) > 0;

  if (deleted && existing) {
    await touchGroupUpdatedAt(existing.groupId, executor);
  }

  return deleted;
}

export async function bulkDeleteRules(ids: string[], executor: DbExecutor = db): Promise<number> {
  if (ids.length === 0) return 0;

  const uniqueIds = Array.from(new Set(ids));
  const existingRules = await executor
    .select({ groupId: whitelistRules.groupId })
    .from(whitelistRules)
    .where(inArray(whitelistRules.id, uniqueIds));
  const deletedCount = getRowCount(
    await executor.delete(whitelistRules).where(inArray(whitelistRules.id, uniqueIds))
  );

  if (deletedCount > 0) {
    const affectedGroupIds = new Set(existingRules.map((rule) => rule.groupId));
    await Promise.all(
      Array.from(affectedGroupIds, (groupId) => touchGroupUpdatedAt(groupId, executor))
    );
  }

  logger.debug('Bulk deleted rules', { count: deletedCount, requested: ids.length });
  return deletedCount;
}

export async function bulkCreateRules(
  groupId: string,
  type: RuleType,
  values: string[],
  source: RuleSource = 'manual',
  executor: DbExecutor = db
): Promise<number> {
  let count = 0;
  for (const value of values) {
    const normalizedValue = normalize.domain(value);
    if (normalizedValue) {
      const result = await createRule(groupId, type, normalizedValue, null, source, executor);
      if (result.success) count++;
    }
  }
  return count;
}

export interface BlockedCheckResult {
  blocked: boolean;
  matchedRule: string | null;
}

export async function isDomainBlocked(
  groupId: string,
  domain: string
): Promise<BlockedCheckResult> {
  const rules = await getRulesByGroup(groupId, 'blocked_subdomain');
  const domainLower = normalize.domain(domain);

  for (const rule of rules) {
    const pattern = rule.value.toLowerCase();

    if (pattern === domainLower) {
      return { blocked: true, matchedRule: pattern };
    }

    if (domainLower.endsWith('.' + pattern)) {
      return { blocked: true, matchedRule: pattern };
    }

    if (pattern.startsWith('*.')) {
      const baseDomain = pattern.slice(2);
      if (domainLower === baseDomain || domainLower.endsWith('.' + baseDomain)) {
        return { blocked: true, matchedRule: pattern };
      }
    }
  }

  return { blocked: false, matchedRule: null };
}

export async function getBlockedSubdomains(groupId: string): Promise<string[]> {
  const rules = await getRulesByGroup(groupId, 'blocked_subdomain');
  return rules.map((rule) => rule.value);
}
