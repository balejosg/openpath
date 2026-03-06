import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useClassroomControlStatesQuery, useClassroomsQuery } from '../useClassroomsList';

let queryClient: QueryClient | null = null;

const { mockClassroomsList } = vi.hoisted(() => ({
  mockClassroomsList: vi.fn(),
}));

vi.mock('../../lib/trpc', () => ({
  trpc: {
    classrooms: {
      list: { query: (): unknown => mockClassroomsList() },
    },
  },
}));

const baseClassroom = {
  id: 'classroom-1',
  name: 'Lab Norte',
  displayName: 'Lab Norte',
  defaultGroupId: 'group-default',
  defaultGroupDisplayName: 'Plan Base',
  machineCount: 12,
  activeGroupId: 'group-manual',
  currentGroupId: 'group-manual',
  currentGroupDisplayName: 'Plan Manual',
  currentGroupSource: 'manual',
  status: 'operational',
  onlineMachineCount: 10,
  machines: [],
  createdAt: '2026-03-06T10:00:00.000Z',
  updatedAt: '2026-03-06T10:00:00.000Z',
};

function renderUseClassroomsQuery<T>(hook: () => T) {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return renderHook(hook, {
    wrapper: ({ children }) => {
      if (!queryClient) {
        throw new Error('queryClient not initialized');
      }

      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    },
  });
}

describe('useClassroomsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClassroomsList.mockResolvedValue([baseClassroom]);
  });

  afterEach(() => {
    queryClient?.clear();
    queryClient = null;
  });

  it('maps classroom list results into the shared Classroom shape', async () => {
    const { result } = renderUseClassroomsQuery(() => useClassroomsQuery());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([
      {
        id: 'classroom-1',
        name: 'Lab Norte',
        displayName: 'Lab Norte',
        defaultGroupId: 'group-default',
        defaultGroupDisplayName: 'Plan Base',
        computerCount: 12,
        activeGroup: 'group-manual',
        currentGroupId: 'group-manual',
        currentGroupDisplayName: 'Plan Manual',
        currentGroupSource: 'manual',
        status: 'operational',
        onlineMachineCount: 10,
        machines: [],
      },
    ]);
  });

  it('refetches classroom control states without losing the selector shape', async () => {
    const { result } = renderUseClassroomsQuery(() => useClassroomControlStatesQuery());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data[0]?.activeGroupId).toBe('group-manual');

    mockClassroomsList.mockResolvedValueOnce([
      {
        ...baseClassroom,
        activeGroupId: null,
        currentGroupId: 'group-default',
        currentGroupDisplayName: 'Plan Base',
        currentGroupSource: 'default',
      },
    ]);

    await act(async () => {
      await result.current.refetchClassrooms();
    });

    await waitFor(() => {
      expect(result.current.data[0]?.currentGroupSource).toBe('default');
    });

    expect(result.current.data[0]?.activeGroupId).toBeNull();
    expect(result.current.data[0]?.currentGroupId).toBe('group-default');
  });
});
