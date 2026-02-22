import { useState, useCallback, useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';
import { detectRuleType, getRuleTypeBadge } from '../lib/ruleDetection';
import { getRootDomain } from '../../../shared/src/domain';
import type { Rule } from '../components/RulesTable';

const PAGE_SIZE = 20; // Number of domain groups per page

export type FilterType = 'all' | 'allowed' | 'blocked';

/** A domain group containing rules under a root domain */
export interface DomainGroup {
  root: string;
  rules: Rule[];
  status: 'allowed' | 'blocked' | 'mixed';
}

interface UseGroupedRulesManagerOptions {
  groupId: string;
  onToast: (message: string, type: 'success' | 'error', undoAction?: () => void) => void;
}

interface UseGroupedRulesManagerReturn {
  // Data
  domainGroups: DomainGroup[];
  totalGroups: number;
  totalRules: number;
  loading: boolean;
  error: string | null;

  // Pagination (by domain groups, not individual rules)
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
  selectGroup: (rootDomain: string) => void;
  deselectGroup: (rootDomain: string) => void;
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
 * Hook for managing rules grouped by root domain with pagination on groups.
 * This ensures domain groups are never split across pages.
 */
export function useGroupedRulesManager({
  groupId,
  onToast,
}: UseGroupedRulesManagerOptions): UseGroupedRulesManagerReturn {
  // Data state
  const [domainGroups, setDomainGroups] = useState<DomainGroup[]>([]);
  const [totalGroups, setTotalGroups] = useState(0);
  const [totalRules, setTotalRules] = useState(0);
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
  const fetchSeqRef = useRef(0);

  // Fetch grouped rules with current filters
  const fetchRules = useCallback(async () => {
    if (!groupId) return;

    const seq = (fetchSeqRef.current += 1);

    try {
      setLoading(true);
      setError(null);

      // If filter is 'blocked', we need to filter the groups
      let filteredGroups: DomainGroup[];

      if (filter === 'blocked') {
        // Fetch both blocked types using non-paginated endpoint
        const [subdomains, paths] = await Promise.all([
          trpc.groups.listRules.query({ groupId, type: 'blocked_subdomain' }),
          trpc.groups.listRules.query({ groupId, type: 'blocked_path' }),
        ]);

        let blockedRules = [...subdomains, ...paths] as Rule[];

        // Apply search filter client-side
        if (search.trim()) {
          const searchLower = search.toLowerCase().trim();
          blockedRules = blockedRules.filter((r) => r.value.toLowerCase().includes(searchLower));
        }

        // Group by root domain
        const groupedMap = new Map<string, Rule[]>();
        for (const rule of blockedRules) {
          const root = getRootDomain(rule.value);
          const existing = groupedMap.get(root) ?? [];
          existing.push(rule);
          groupedMap.set(root, existing);
        }

        // Sort root domains alphabetically
        const sortedRoots = Array.from(groupedMap.keys()).sort((a, b) => a.localeCompare(b));

        // Build domain groups with status
        const allBlockedGroups: DomainGroup[] = sortedRoots.map((root) => {
          const groupRules = groupedMap.get(root) ?? [];
          groupRules.sort((a, b) => a.value.localeCompare(b.value));
          return { root, rules: groupRules, status: 'blocked' as const };
        });

        // Update totals
        if (seq === fetchSeqRef.current) {
          setTotalGroups(allBlockedGroups.length);
          setTotalRules(blockedRules.length);
        }

        // Apply pagination manually
        const start = (page - 1) * PAGE_SIZE;
        filteredGroups = allBlockedGroups.slice(start, start + PAGE_SIZE);
      } else {
        // Fetch grouped rules for 'all' or 'allowed' filter
        const result = await trpc.groups.listRulesGrouped.query({
          groupId,
          type: filter === 'allowed' ? 'whitelist' : undefined,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          search: search.trim() || undefined,
        });

        filteredGroups = result.groups as DomainGroup[];
        if (seq === fetchSeqRef.current) {
          setTotalGroups(result.totalGroups);
          setTotalRules(result.totalRules);
        }
      }

      if (seq === fetchSeqRef.current) {
        setDomainGroups(filteredGroups);
      }
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      console.error('Failed to fetch grouped rules:', err);
      setError('Error al cargar reglas');
    } finally {
      if (seq === fetchSeqRef.current) {
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

  // Get all rules from current domain groups
  const allRulesInView = domainGroups.flatMap((g) => g.rules);

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
    const allIds = allRulesInView.map((r) => r.id);
    if (selectedIds.size === allIds.length) {
      // All selected, deselect all
      setSelectedIds(new Set());
    } else {
      // Select all current page rules
      setSelectedIds(new Set(allIds));
    }
  }, [allRulesInView, selectedIds.size]);

  const selectGroup = useCallback(
    (rootDomain: string) => {
      const group = domainGroups.find((g) => g.root === rootDomain);
      if (!group) return;

      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const rule of group.rules) {
          next.add(rule.id);
        }
        return next;
      });
    },
    [domainGroups]
  );

  const deselectGroup = useCallback(
    (rootDomain: string) => {
      const group = domainGroups.find((g) => g.root === rootDomain);
      if (!group) return;

      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const rule of group.rules) {
          next.delete(rule.id);
        }
        return next;
      });
    },
    [domainGroups]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Add rule
  const addRule = useCallback(
    async (value: string): Promise<boolean> => {
      const trimmed = value.trim();
      if (!trimmed) return false;

      // Get existing whitelist for detection
      const existingWhitelist = await trpc.groups.listRules.query({
        groupId,
        type: 'whitelist',
      });
      const whitelistDomains = existingWhitelist.map((r) => r.value);

      // Detect type
      const detected = detectRuleType(trimmed, whitelistDomains);

      try {
        await trpc.groups.createRule.mutate({
          groupId,
          type: detected.type,
          value: detected.cleanedValue,
        });

        onToast(
          `"${detected.cleanedValue}" añadido como ${getRuleTypeBadge(detected.type)}`,
          'success'
        );
        await fetchRules();
        await fetchCounts();
        return true;
      } catch (err) {
        console.error('Failed to add rule:', err);
        onToast('Error al añadir regla', 'error');
        return false;
      }
    },
    [groupId, fetchRules, fetchCounts, onToast]
  );

  // Delete rule with undo
  const deleteRule = useCallback(
    async (rule: Rule): Promise<void> => {
      try {
        await trpc.groups.deleteRule.mutate({ id: rule.id, groupId: rule.groupId });

        onToast(`"${rule.value}" eliminado`, 'success', () => {
          void (async () => {
            try {
              await trpc.groups.createRule.mutate({
                groupId: rule.groupId,
                type: rule.type,
                value: rule.value,
                comment: rule.comment ?? undefined,
              });
              await fetchRules();
              await fetchCounts();
              onToast(`"${rule.value}" restaurado`, 'success');
            } catch (err) {
              console.error('Failed to undo delete:', err);
              onToast('Error al restaurar regla', 'error');
            }
          })();
        });

        await fetchRules();
        await fetchCounts();
      } catch (err) {
        console.error('Failed to delete rule:', err);
        onToast('Error al eliminar regla', 'error');
      }
    },
    [fetchRules, fetchCounts, onToast]
  );

  // Update rule
  const updateRule = useCallback(
    async (id: string, data: { value?: string; comment?: string | null }): Promise<boolean> => {
      try {
        await trpc.groups.updateRule.mutate({
          id,
          groupId,
          value: data.value,
          comment: data.comment,
        });

        onToast('Regla actualizada', 'success');
        await fetchRules();
        return true;
      } catch (err) {
        console.error('Failed to update rule:', err);
        onToast('Error al actualizar regla', 'error');
        return false;
      }
    },
    [groupId, fetchRules, onToast]
  );

  // Bulk delete rules with undo
  const bulkDeleteRules = useCallback(async (): Promise<void> => {
    if (selectedIds.size === 0) return;

    const idsToDelete = Array.from(selectedIds);

    try {
      const result = await trpc.groups.bulkDeleteRules.mutate({ ids: idsToDelete });

      const deletedRules = result.rules;
      const count = result.deleted;

      clearSelection();

      onToast(`${String(count)} reglas eliminadas`, 'success', () => {
        void (async () => {
          try {
            // Restore all deleted rules
            for (const rule of deletedRules) {
              await trpc.groups.createRule.mutate({
                groupId: rule.groupId,
                type: rule.type,
                value: rule.value,
                comment: rule.comment ?? undefined,
              });
            }
            await fetchRules();
            await fetchCounts();
            onToast(`${String(deletedRules.length)} reglas restauradas`, 'success');
          } catch (err) {
            console.error('Failed to undo bulk delete:', err);
            onToast('Error al restaurar reglas', 'error');
          }
        })();
      });

      await fetchRules();
      await fetchCounts();
    } catch (err) {
      console.error('Failed to bulk delete rules:', err);
      onToast('Error al eliminar reglas', 'error');
    }
  }, [selectedIds, clearSelection, fetchRules, fetchCounts, onToast]);

  // Bulk create rules
  const bulkCreateRules = useCallback(
    async (
      values: string[],
      type: 'whitelist' | 'blocked_subdomain' | 'blocked_path'
    ): Promise<{ created: number; total: number }> => {
      if (values.length === 0) return { created: 0, total: 0 };

      try {
        const result = await trpc.groups.bulkCreateRules.mutate({
          groupId,
          type,
          values,
        });

        const created = result.count;
        const total = values.length;

        if (created > 0) {
          onToast(
            created === total
              ? `${String(created)} reglas importadas`
              : `${String(created)} de ${String(total)} reglas importadas (${String(total - created)} duplicadas)`,
            'success'
          );
          await fetchRules();
          await fetchCounts();
        } else {
          onToast('Todas las reglas ya existen', 'error');
        }

        return { created, total };
      } catch (err) {
        console.error('Failed to bulk create rules:', err);
        onToast('Error al importar reglas', 'error');
        return { created: 0, total: values.length };
      }
    },
    [groupId, fetchRules, fetchCounts, onToast]
  );

  // Calculate derived values
  const totalPages = Math.ceil(totalGroups / PAGE_SIZE);
  const hasMore = page < totalPages;
  const isAllSelected = allRulesInView.length > 0 && selectedIds.size === allRulesInView.length;
  const hasSelection = selectedIds.size > 0;

  return {
    // Data
    domainGroups,
    totalGroups,
    totalRules,
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
    selectGroup,
    deselectGroup,
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

export default useGroupedRulesManager;
