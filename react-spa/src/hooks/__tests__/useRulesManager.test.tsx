import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useRulesManager } from '../useRulesManager';

// Mock trpc
vi.mock('../../lib/trpc', () => ({
  trpc: {
    groups: {
      listRulesPaginated: {
        query: vi.fn().mockResolvedValue({
          rules: [
            {
              id: '1',
              groupId: 'test-group',
              type: 'whitelist',
              value: 'google.com',
              comment: null,
              createdAt: '2024-01-15T10:00:00Z',
            },
          ],
          total: 1,
          hasMore: false,
        }),
      },
      listRules: {
        query: vi.fn().mockResolvedValue([
          {
            id: '1',
            groupId: 'test-group',
            type: 'whitelist',
            value: 'google.com',
            comment: null,
            createdAt: '2024-01-15T10:00:00Z',
          },
        ]),
      },
      createRule: {
        mutate: vi.fn().mockResolvedValue({ id: '2' }),
      },
      deleteRule: {
        mutate: vi.fn().mockResolvedValue({ deleted: true }),
      },
      updateRule: {
        mutate: vi.fn().mockResolvedValue({
          id: '1',
          groupId: 'test-group',
          type: 'whitelist',
          value: 'updated.com',
          comment: null,
          createdAt: '2024-01-15T10:00:00Z',
        }),
      },
    },
  },
}));

describe('useRulesManager Hook', () => {
  const mockOnToast = vi.fn();
  const defaultOptions = {
    groupId: 'test-group',
    onToast: mockOnToast,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with loading state', () => {
    const { result } = renderHook(() => useRulesManager(defaultOptions));

    expect(result.current.loading).toBe(true);
  });

  it('fetches rules on mount', async () => {
    const { result } = renderHook(() => useRulesManager(defaultOptions));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.rules).toHaveLength(1);
    expect(result.current.rules[0].value).toBe('google.com');
  });

  it('provides filter state and setter', async () => {
    const { result } = renderHook(() => useRulesManager(defaultOptions));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.filter).toBe('all');

    act(() => {
      result.current.setFilter('allowed');
    });

    expect(result.current.filter).toBe('allowed');
  });

  it('provides search state and setter', async () => {
    const { result } = renderHook(() => useRulesManager(defaultOptions));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.search).toBe('');

    act(() => {
      result.current.setSearch('google');
    });

    expect(result.current.search).toBe('google');
  });

  it('provides pagination state', async () => {
    const { result } = renderHook(() => useRulesManager(defaultOptions));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('provides counts for tabs', async () => {
    const { result } = renderHook(() => useRulesManager(defaultOptions));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.counts).toHaveProperty('all');
    expect(result.current.counts).toHaveProperty('allowed');
    expect(result.current.counts).toHaveProperty('blocked');
  });

  it('provides CRUD operations', async () => {
    const { result } = renderHook(() => useRulesManager(defaultOptions));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(typeof result.current.addRule).toBe('function');
    expect(typeof result.current.deleteRule).toBe('function');
    expect(typeof result.current.updateRule).toBe('function');
    expect(typeof result.current.refetch).toBe('function');
  });
});
