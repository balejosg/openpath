import type { RuleType } from '@openpath/shared/rules-validation';

export type { RuleType };

export type RuleCategory = 'allowed' | 'blocked';

export interface Rule {
  id: string;
  groupId: string;
  type: RuleType;
  value: string;
  source?: 'manual' | 'auto_extension';
  comment: string | null;
  createdAt: string;
}

const RULE_TYPE_META_ES: Record<
  RuleType,
  {
    label: string;
    badge: string;
    exportLabel: string;
    category: RuleCategory;
  }
> = {
  whitelist: {
    label: 'Dominio permitido',
    badge: 'Permitido',
    exportLabel: 'Permitido',
    category: 'allowed',
  },
  blocked_subdomain: {
    label: 'Subdominio bloqueado',
    badge: 'Sub. bloq.',
    exportLabel: 'Subdominio bloqueado',
    category: 'blocked',
  },
  blocked_path: {
    label: 'Ruta bloqueada',
    badge: 'Ruta bloq.',
    exportLabel: 'Ruta bloqueada',
    category: 'blocked',
  },
};

export function getRuleTypeLabel(type: RuleType): string {
  return RULE_TYPE_META_ES[type].label;
}

export function getRuleTypeBadge(type: RuleType): string {
  return RULE_TYPE_META_ES[type].badge;
}

export function getRuleTypeExportLabel(type: RuleType): string {
  return RULE_TYPE_META_ES[type].exportLabel;
}

export function categorizeRuleType(type: RuleType): RuleCategory {
  return RULE_TYPE_META_ES[type].category;
}
