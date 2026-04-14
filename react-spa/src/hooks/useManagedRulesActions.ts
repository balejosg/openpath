import { useCallback } from 'react';
import {
  addRuleWithDetection,
  bulkCreateRulesAction,
  bulkDeleteRulesWithUndoAction,
  deleteRuleWithUndoAction,
  updateRuleAction,
} from '../lib/rules-actions';
import type { Rule, RuleType } from '../lib/rules';

interface UseManagedRulesActionsOptions {
  groupId: string;
  onToast: (message: string, type: 'success' | 'error', undoAction?: () => void) => void;
  selectedIds: Set<string>;
  clearSelection: () => void;
  refetchRules: () => Promise<void>;
  refetchCounts: () => Promise<void>;
}

export function useManagedRulesActions({
  groupId,
  onToast,
  selectedIds,
  clearSelection,
  refetchRules,
  refetchCounts,
}: UseManagedRulesActionsOptions) {
  const addRule = useCallback(
    async (value: string): Promise<boolean> => {
      return addRuleWithDetection(value, {
        groupId,
        onToast,
        fetchRules: refetchRules,
        fetchCounts: refetchCounts,
      });
    },
    [groupId, onToast, refetchRules, refetchCounts]
  );

  const deleteRule = useCallback(
    async (rule: Rule): Promise<void> => {
      await deleteRuleWithUndoAction(rule, {
        onToast,
        fetchRules: refetchRules,
        fetchCounts: refetchCounts,
      });
    },
    [onToast, refetchRules, refetchCounts]
  );

  const updateRule = useCallback(
    async (id: string, data: { value?: string; comment?: string | null }): Promise<boolean> => {
      return updateRuleAction(id, data, {
        groupId,
        onToast,
        fetchRules: refetchRules,
      });
    },
    [groupId, onToast, refetchRules]
  );

  const bulkDeleteRules = useCallback(async (): Promise<void> => {
    if (selectedIds.size === 0) return;

    await bulkDeleteRulesWithUndoAction({
      ids: Array.from(selectedIds),
      clearSelection,
      onToast,
      fetchRules: refetchRules,
      fetchCounts: refetchCounts,
    });
  }, [selectedIds, clearSelection, onToast, refetchRules, refetchCounts]);

  const bulkCreateRules = useCallback(
    async (values: string[], type: RuleType): Promise<{ created: number; total: number }> => {
      if (values.length === 0) return { created: 0, total: 0 };

      return bulkCreateRulesAction(values, type, {
        groupId,
        onToast,
        fetchRules: refetchRules,
        fetchCounts: refetchCounts,
      });
    },
    [groupId, onToast, refetchRules, refetchCounts]
  );

  return {
    addRule,
    deleteRule,
    updateRule,
    bulkDeleteRules,
    bulkCreateRules,
  };
}
