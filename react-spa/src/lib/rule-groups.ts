import { getRootDomain } from '@openpath/shared/domain';

import type { Rule } from './rules';

export interface DomainGroup {
  root: string;
  rules: Rule[];
  status: 'allowed' | 'blocked' | 'mixed';
}

export function toDomainGroups(rules: Rule[]): DomainGroup[] {
  if (rules.length === 0) {
    return [];
  }

  const grouped = new Map<string, DomainGroup>();

  for (const rule of rules) {
    const root = getRootDomain(rule.value);
    const existing = grouped.get(root);
    if (existing) {
      existing.rules.push(rule);
      continue;
    }

    grouped.set(root, { root, rules: [rule], status: 'mixed' });
  }

  for (const group of grouped.values()) {
    const allAllowed = group.rules.every((rule) => rule.type === 'whitelist');
    const allBlocked = group.rules.every((rule) => rule.type !== 'whitelist');
    group.status = allAllowed ? 'allowed' : allBlocked ? 'blocked' : 'mixed';
  }

  return Array.from(grouped.values()).sort((left, right) => left.root.localeCompare(right.root));
}
