import { useMemo } from 'react';

export interface NormalizedSearchOptions {
  collapseWhitespace?: boolean;
  stripDiacritics?: boolean;
}

const DEFAULT_OPTIONS: Required<NormalizedSearchOptions> = {
  collapseWhitespace: true,
  stripDiacritics: true,
};

function normalizeDiacritics(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeSearchTerm(
  input: string,
  options: NormalizedSearchOptions = DEFAULT_OPTIONS
): string {
  const merged = { ...DEFAULT_OPTIONS, ...options };

  let value = input.trim().toLowerCase();
  if (merged.collapseWhitespace) {
    value = value.replace(/\s+/g, ' ');
  }
  if (merged.stripDiacritics) {
    value = normalizeDiacritics(value);
  }

  return value;
}

export function useNormalizedSearch(
  rawQuery: string,
  options: NormalizedSearchOptions = DEFAULT_OPTIONS
): string {
  return useMemo(() => normalizeSearchTerm(rawQuery, options), [rawQuery, options]);
}
