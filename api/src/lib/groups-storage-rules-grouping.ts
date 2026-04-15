import { getRootDomain } from '@openpath/shared';
import {
  dbRuleToApi,
  type DomainGroup,
  type ListRulesGroupedOptions,
  type PaginatedGroupedRulesResult,
} from './groups-storage-shared.js';
import { listRuleRowsByGroup } from './groups-storage-rules-shared.js';

export async function getRulesByGroupGrouped(
  options: ListRulesGroupedOptions
): Promise<PaginatedGroupedRulesResult> {
  const { groupId, type, limit = 20, offset = 0, search } = options;
  const rules = await listRuleRowsByGroup(groupId, type);

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
