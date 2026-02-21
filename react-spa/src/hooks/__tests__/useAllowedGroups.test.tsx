import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useAllowedGroups } from '../useAllowedGroups';

focusManager.setEventListener((handleFocus) => {
  const onVisibilityChange = () => {
    handleFocus(document.visibilityState === 'visible');
  };
  const onFocus = () => {
    handleFocus(true);
  };

  window.addEventListener('visibilitychange', onVisibilityChange, false);
  window.addEventListener('focus', onFocus, false);
  return () => {
    window.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('focus', onFocus);
  };
});

let queryClient: QueryClient | null = null;

const { mockListGroups } = vi.hoisted(() => ({
  mockListGroups: vi.fn(),
}));

vi.mock('../../lib/trpc', () => ({
  trpc: {
    groups: {
      list: {
        query: mockListGroups,
      },
    },
  },
}));

function renderUseAllowedGroups() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return renderHook(() => useAllowedGroups(), {
    wrapper: ({ children }) => {
      if (!queryClient) {
        throw new Error('queryClient not initialized');
      }
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    },
  });
}

afterEach(() => {
  queryClient?.clear();
  queryClient = null;
});

describe('useAllowedGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty groups with derived structures', async () => {
    mockListGroups.mockResolvedValueOnce([]);

    const { result } = renderUseAllowedGroups();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.groups).toEqual([]);
    expect(result.current.groupById).toBeInstanceOf(Map);
    expect(result.current.groupById.size).toBe(0);
    expect(result.current.options).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('derives groupById and options for non-empty results', async () => {
    mockListGroups.mockResolvedValueOnce([
      {
        id: 'group-1',
        name: 'grupo-1',
        displayName: 'Grupo 1',
      },
      {
        id: 'group-2',
        name: 'grupo-2',
        displayName: '',
      },
    ]);

    const { result } = renderUseAllowedGroups();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.groups).toHaveLength(2);
    expect(result.current.groupById.get('group-1')?.name).toBe('grupo-1');
    expect(result.current.options).toEqual([
      { value: 'group-1', label: 'Grupo 1' },
      { value: 'group-2', label: 'grupo-2' },
    ]);
  });

  it('surfaces query errors without throwing', async () => {
    mockListGroups.mockRejectedValueOnce(new Error('API Error'));

    const { result } = renderUseAllowedGroups();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.groups).toEqual([]);
    expect(result.current.error).toBe('API Error');
  });
});
