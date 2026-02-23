import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUsersActions } from '../useUsersActions';

const mockUsersCreateMutate = vi.fn();
const mockUsersUpdateMutate = vi.fn();
const mockUsersDeleteMutate = vi.fn();

vi.mock('../../lib/trpc', () => ({
  trpc: {
    users: {
      create: { mutate: (input: unknown): unknown => mockUsersCreateMutate(input) },
      update: { mutate: (input: unknown): unknown => mockUsersUpdateMutate(input) },
      delete: { mutate: (input: unknown): unknown => mockUsersDeleteMutate(input) },
    },
  },
}));

describe('useUsersActions', () => {
  const fetchUsers = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchUsers.mockResolvedValue(undefined);
  });

  it('validates required create fields before API call', async () => {
    const { result } = renderHook(() => useUsersActions({ fetchUsers }));

    let createResult: Awaited<ReturnType<typeof result.current.handleCreateUser>> = { ok: false };
    await act(async () => {
      createResult = await result.current.handleCreateUser({
        name: '',
        email: 'user@example.com',
        password: 'SecurePass123!',
        role: 'teacher',
      });
    });

    expect(createResult.ok).toBe(false);
    expect(result.current.createError).toBe('El nombre es obligatorio');
    expect(mockUsersCreateMutate).not.toHaveBeenCalled();
  });

  it('maps duplicate-user errors into actionable create message', async () => {
    mockUsersCreateMutate.mockRejectedValueOnce(new Error('User already exists'));
    const { result } = renderHook(() => useUsersActions({ fetchUsers }));

    await act(async () => {
      await result.current.handleCreateUser({
        name: 'Usuario Repetido',
        email: 'dup@example.com',
        password: 'SecurePass123!',
        role: 'teacher',
      });
    });

    expect(result.current.createError).toBe('Ya existe un usuario con ese email');
  });

  it('shows inline delete error when delete mutation fails', async () => {
    mockUsersDeleteMutate.mockRejectedValueOnce(new Error('backend failure'));
    const { result } = renderHook(() => useUsersActions({ fetchUsers }));

    act(() => {
      result.current.requestDeleteUser({ id: 'user-1', name: 'Cannot Delete' });
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.handleConfirmDeleteUser();
    });

    expect(ok).toBe(false);
    expect(result.current.deleteError).toBe('No se pudo eliminar usuario. Intenta nuevamente.');
  });
});
