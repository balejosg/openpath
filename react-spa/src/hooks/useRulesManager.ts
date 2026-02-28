import { useState, useCallback, useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';
import {
  addRuleWithDetection,
  bulkCreateRulesAction,
  bulkDeleteRulesWithUndoAction,
  deleteRuleWithUndoAction,
  updateRuleAction,
} from '../lib/rules-actions';
import { createLatestGuard } from '../lib/latest';
import type { Rule } from '../components/RulesTable';

const PAGE_SIZE = 50;

export type FilterType = 'all' | 'allowed' | 'blocked';

interface UseRulesManagerOptions {
  groupId: string;
  onToast: (message: string, type: 'success' | 'error', undoAction?: () => void) => void;
}

interface UseRulesManagerReturn {
  // Data
  rules: Rule[];
  total: number;
  loading: boolean;
  error: string | null;

  // Pagination
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  hasMore: boolean;

  // Filtering
  filter: FilterType;
  setFilter: (filter: FilterType) => void;
  search: string;
  setSearch: (search: string) => void;

  // Counts
  counts: { all: number; allowed: number; blocked: number };

  // Selection
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  toggleSelectAll: () => void;
  clearSelection: () => void;
  isAllSelected: boolean;
  hasSelection: boolean;

  // Actions
  addRule: (value: string) => Promise<boolean>;
  deleteRule: (rule: Rule) => Promise<void>;
  bulkDeleteRules: () => Promise<void>;
  bulkCreateRules: (
    values: string[],
    type: 'whitelist' | 'blocked_subdomain' | 'blocked_path'
  ) => Promise<{ created: number; total: number }>;
  updateRule: (id: string, data: { value?: string; comment?: string | null }) => Promise<boolean>;
  refetch: () => Promise<void>;
}

/**
 * Hook for managing rules with pagination, filtering, and CRUD operations.
 */
export function useRulesManager({
  groupId,
  onToast,
}: UseRulesManagerOptions): UseRulesManagerReturn {
  // Data state
  const [rules, setRules] = useState<Rule[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);

  // Filter state
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');

  // Counts for tabs
  const [counts, setCounts] = useState({ all: 0, allowed: 0, blocked: 0 });

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Debounce ref for search
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prevent stale in-flight fetches from overwriting newer state.
  const fetchSeqRef = useRef(createLatestGuard());

  // Fetch rules with current filters
  const fetchRules = useCallback(async () => {
    if (!groupId) return;

    const seq = fetchSeqRef.current.next();

    try {
      setLoading(true);
      setError(null);

      let filteredRules: Rule[];
      let filteredTotal: number;

      if (filter === 'blocked') {
        // Fetch both blocked types using non-paginated endpoint
        const [subdomains, paths] = await Promise.all([
          trpc.groups.listRules.query({ groupId, type: 'blocked_subdomain' }),
          trpc.groups.listRules.query({ groupId, type: 'blocked_path' }),
        ]);

        let blockedRules = [...subdomains, ...paths];

        // Apply search filter client-side
        if (search.trim()) {
          const searchLower = search.toLowerCase().trim();
          blockedRules = blockedRules.filter((r) => r.value.toLowerCase().includes(searchLower));
        }

        // Sort by value
        blockedRules.sort((a, b) => a.value.localeCompare(b.value));

        filteredTotal = blockedRules.length;

        // Apply pagination manually
        const start = (page - 1) * PAGE_SIZE;
        filteredRules = blockedRules.slice(start, start + PAGE_SIZE);
      } else {
        // Fetch paginated rules for 'all' or 'allowed' filter
        const result = await trpc.groups.listRulesPaginated.query({
          groupId,
          type: filter === 'allowed' ? 'whitelist' : undefined,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          search: search.trim() || undefined,
        });

        filteredRules = result.rules;
        filteredTotal = result.total;
      }

      if (fetchSeqRef.current.isLatest(seq)) {
        setRules(filteredRules);
        setTotal(filteredTotal);
      }
    } catch (err) {
      if (!fetchSeqRef.current.isLatest(seq)) return;
      console.error('Failed to fetch rules:', err);
      setError('Error al cargar reglas');
    } finally {
      if (fetchSeqRef.current.isLatest(seq)) {
        setLoading(false);
      }
    }
  }, [groupId, filter, page, search]);

  // Fetch counts for tabs
  const fetchCounts = useCallback(async () => {
    if (!groupId) return;

    try {
      // Fetch all rules to get accurate counts
      const [whitelist, subdomains, paths] = await Promise.all([
        trpc.groups.listRules.query({ groupId, type: 'whitelist' }),
        trpc.groups.listRules.query({ groupId, type: 'blocked_subdomain' }),
        trpc.groups.listRules.query({ groupId, type: 'blocked_path' }),
      ]);

      const allowed = whitelist.length;
      const blocked = subdomains.length + paths.length;

      setCounts({
        all: allowed + blocked,
        allowed,
        blocked,
      });
    } catch (err) {
      console.error('Failed to fetch counts:', err);
    }
  }, [groupId]);

  // Fetch on mount and when dependencies change
  useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    void fetchCounts();
  }, [fetchCounts]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setPage(1); // Reset to first page on search
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [filter]);

  // Clear selection when rules change (pagination, filter, search)
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, filter, search]);

  // Selection handlers
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
    if (selectedIds.size === rules.length) {
      // All selected, deselect all
      setSelectedIds(new Set());
    } else {
      // Select all current page rules
      setSelectedIds(new Set(rules.map((r) => r.id)));
    }
  }, [rules, selectedIds.size]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Add rule
  const addRule = useCallback(
    async (value: string): Promise<boolean> => {
      return addRuleWithDetection(value, { groupId, onToast, fetchRules, fetchCounts });
    },
    [groupId, fetchRules, fetchCounts, onToast]
  );

  // Delete rule with undo
  const deleteRule = useCallback(
    async (rule: Rule): Promise<void> => {
      await deleteRuleWithUndoAction(rule, { onToast, fetchRules, fetchCounts });
    },
    [fetchRules, fetchCounts, onToast]
  );

  // Update rule
  const updateRule = useCallback(
    async (id: string, data: { value?: string; comment?: string | null }): Promise<boolean> => {
      return updateRuleAction(id, data, { groupId, onToast, fetchRules });
    },
    [groupId, fetchRules, onToast]
  );

  // Bulk delete rules with undo
  const bulkDeleteRules = useCallback(async (): Promise<void> => {
    if (selectedIds.size === 0) return;

    const idsToDelete = Array.from(selectedIds);

    await bulkDeleteRulesWithUndoAction({
      ids: idsToDelete,
      clearSelection,
      onToast,
      fetchRules,
      fetchCounts,
    });
  }, [selectedIds, clearSelection, fetchRules, fetchCounts, onToast]);

  // Bulk create rules
  const bulkCreateRules = useCallback(
    async (
      values: string[],
      type: 'whitelist' | 'blocked_subdomain' | 'blocked_path'
    ): Promise<{ created: number; total: number }> => {
      if (values.length === 0) return { created: 0, total: 0 };

      return bulkCreateRulesAction(values, type, { groupId, onToast, fetchRules, fetchCounts });
    },
    [groupId, fetchRules, fetchCounts, onToast]
  );

  // Calculate derived values
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasMore = page < totalPages;
  const isAllSelected = rules.length > 0 && selectedIds.size === rules.length;
  const hasSelection = selectedIds.size > 0;

  return {
    // Data
    rules,
    total,
    loading,
    error,

    // Pagination
    page,
    setPage,
    totalPages,
    hasMore,

    // Filtering
    filter,
    setFilter,
    search,
    setSearch,

    // Counts
    counts,

    // Selection
    selectedIds,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    isAllSelected,
    hasSelection,

    // Actions
    addRule,
    deleteRule,
    bulkDeleteRules,
    bulkCreateRules,
    updateRule,
    refetch: async () => {
      await Promise.all([fetchRules(), fetchCounts()]);
    },
  };
}

export default useRulesManager;
