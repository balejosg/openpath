import { describe, expect, it } from 'vitest';
import { normalizeSearchTerm } from '../useNormalizedSearch';

describe('normalizeSearchTerm', () => {
  it('trims, lowercases, and collapses internal spaces', () => {
    expect(normalizeSearchTerm('   Aula   LAB   01  ')).toBe('aula lab 01');
  });

  it('normalizes accents to support diacritic-insensitive search', () => {
    expect(normalizeSearchTerm('Políticas de Grupo')).toBe('politicas de grupo');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeSearchTerm('     ')).toBe('');
  });
});
