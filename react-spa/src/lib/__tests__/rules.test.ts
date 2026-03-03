import { describe, expect, it } from 'vitest';

import {
  categorizeRuleType,
  getRuleTypeBadge,
  getRuleTypeExportLabel,
  getRuleTypeLabel,
} from '../rules';

describe('rules helpers', () => {
  it('provides Spanish labels for each rule type', () => {
    expect(getRuleTypeLabel('whitelist')).toBe('Dominio permitido');
    expect(getRuleTypeLabel('blocked_subdomain')).toBe('Subdominio bloqueado');
    expect(getRuleTypeLabel('blocked_path')).toBe('Ruta bloqueada');
  });

  it('provides short badges for each rule type', () => {
    expect(getRuleTypeBadge('whitelist')).toBe('Permitido');
    expect(getRuleTypeBadge('blocked_subdomain')).toBe('Sub. bloq.');
    expect(getRuleTypeBadge('blocked_path')).toBe('Ruta bloq.');
  });

  it('provides export labels for each rule type', () => {
    expect(getRuleTypeExportLabel('whitelist')).toBe('Permitido');
    expect(getRuleTypeExportLabel('blocked_subdomain')).toBe('Subdominio bloqueado');
    expect(getRuleTypeExportLabel('blocked_path')).toBe('Ruta bloqueada');
  });

  it('categorizes rule types as allowed/blocked', () => {
    expect(categorizeRuleType('whitelist')).toBe('allowed');
    expect(categorizeRuleType('blocked_subdomain')).toBe('blocked');
    expect(categorizeRuleType('blocked_path')).toBe('blocked');
  });
});
