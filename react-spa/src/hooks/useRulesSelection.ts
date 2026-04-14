import { useCallback, useEffect, useState } from 'react';

interface SelectableRule {
  id: string;
}

interface UseRulesSelectionOptions<T extends SelectableRule> {
  rules: T[];
  resetKeys?: unknown[];
}

export function useRulesSelection<T extends SelectableRule>({
  rules,
  resetKeys = [],
}: UseRulesSelectionOptions<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set());
  }, [rules, ...resetKeys]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === rules.length) {
        return new Set();
      }
      return new Set(rules.map((rule) => rule.id));
    });
  }, [rules]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    isAllSelected: rules.length > 0 && selectedIds.size === rules.length,
    hasSelection: selectedIds.size > 0,
  };
}
