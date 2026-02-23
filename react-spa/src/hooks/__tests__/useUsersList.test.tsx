import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '../../types';
import { useUsersList } from '../useUsersList';

const { mockUsersList } = vi.hoisted(() => ({
  mockUsersList: vi.fn(),
}));

vi.mock('../../lib/trpc', () => ({
  trpc: {
    users: {
      list: { query: (): unknown => mockUsersList() },
    },
  },
}));

describe('useUsersList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsersList.mockResolvedValue([]);
  });

  it('fetches users on mount and maps roles/status', async () => {
    mockUsersList.mockResolvedValueOnce([
      {
        id: 'u1',
        name: 'Teacher User',
        email: 'teacher@example.com',
        isActive: true,
        roles: [{ role: 'teacher' }],
      },
    ]);

    const { result } = renderHook(() => useUsersList());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.users).toEqual([
      {
        id: 'u1',
        name: 'Teacher User',
        email: 'teacher@example.com',
        roles: [UserRole.TEACHER],
        status: 'Active',
      },
    ]);
  });

  it('upserts an API user to the front of the list', async () => {
    const { result } = renderHook(() => useUsersList());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      const ok = result.current.upsertApiUser({
        id: 'u2',
        name: 'Admin User',
        email: 'admin@example.com',
        isActive: true,
        roles: [{ role: 'admin' }],
      });
      expect(ok).toBe(true);
    });

    expect(result.current.users[0]?.id).toBe('u2');

    act(() => {
      const ok = result.current.upsertApiUser({
        id: 'u2',
        name: 'Admin Renamed',
        email: 'admin@example.com',
        isActive: true,
        roles: [{ role: 'admin' }],
      });
      expect(ok).toBe(true);
    });

    expect(result.current.users).toHaveLength(1);
    expect(result.current.users[0]?.name).toBe('Admin Renamed');
  });

  it('returns false for invalid API user shapes', async () => {
    const { result } = renderHook(() => useUsersList());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      expect(result.current.upsertApiUser({})).toBe(false);
    });
  });

  it('surfaces fetch errors via error state', async () => {
    mockUsersList.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => useUsersList());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Error al cargar usuarios');
    expect(result.current.users).toEqual([]);
  });
});
