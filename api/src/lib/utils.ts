/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Utility functions for handling strict TypeScript types
 */

/**
 * Removes all properties with undefined values from an object.
 * This is useful when working with exactOptionalPropertyTypes,
 * where you cannot pass undefined to optional properties.
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

export function getRows<T>(result: unknown): T[] {
  if (typeof result !== 'object' || result === null || !('rows' in result)) {
    return [];
  }

  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

export function getRowCount(result: unknown): number {
  if (typeof result !== 'object' || result === null || !('rowCount' in result)) {
    return 0;
  }

  const rowCount = (result as { rowCount?: unknown }).rowCount;
  return typeof rowCount === 'number' ? rowCount : 0;
}
