import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import type { User } from '../types';
import type { CreateUserRole } from '../lib/roles';
import { resolveErrorMessage } from '../lib/error-utils';
import { trpc } from '../lib/trpc';
import { mapUnknownApiUserToUser, USERS_QUERY_KEY } from './useUsersList';

export interface UserDeleteTarget {
  id: string;
  name: string;
}

interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: CreateUserRole;
}

type CreatedUser = Awaited<ReturnType<typeof trpc.users.create.mutate>>;

export type CreateUserResult = { ok: true; user: CreatedUser } | { ok: false };

interface UpdateUserInput {
  id: string;
  name: string;
  email: string;
}

export const useUsersActions = () => {
  const queryClient = useQueryClient();

  const invalidateUsersList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
  }, [queryClient]);

  const refreshUsersList = useCallback(async () => {
    // Cancelling first prevents in-flight list responses from overwriting newer state.
    await queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
    invalidateUsersList();
  }, [invalidateUsersList, queryClient]);

  const [createError, setCreateError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserDeleteTarget | null>(null);

  const createMutation = useMutation({
    mutationFn: async (input: CreateUserInput) => {
      return await trpc.users.create.mutate(input);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateUserInput) => {
      return await trpc.users.update.mutate(input);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (input: { id: string }) => {
      return await trpc.users.delete.mutate(input);
    },
  });

  const saving = createMutation.status === 'pending' || updateMutation.status === 'pending';
  const deleting = deleteMutation.status === 'pending';

  const upsertUserInCache = useCallback(
    async (apiUser: unknown) => {
      const mapped = mapUnknownApiUserToUser(apiUser);
      if (!mapped) {
        // If we can't safely map the create response, still force a refresh.
        await refreshUsersList();
        return;
      }

      await queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
      queryClient.setQueryData<User[]>(USERS_QUERY_KEY, (prev) => {
        const prevUsers = Array.isArray(prev) ? prev : [];
        return [mapped, ...prevUsers.filter((u) => u.id !== mapped.id)];
      });
      invalidateUsersList();
    },
    [invalidateUsersList, queryClient, refreshUsersList]
  );

  const updateUserInCache = useCallback(
    async (apiUser: unknown) => {
      const mapped = mapUnknownApiUserToUser(apiUser);
      if (!mapped) {
        await refreshUsersList();
        return;
      }

      await queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
      queryClient.setQueryData<User[]>(USERS_QUERY_KEY, (prev) => {
        const prevUsers = Array.isArray(prev) ? prev : [];
        const idx = prevUsers.findIndex((u) => u.id === mapped.id);
        if (idx === -1) return [mapped, ...prevUsers];
        const next = [...prevUsers];
        next[idx] = mapped;
        return next;
      });
      invalidateUsersList();
    },
    [invalidateUsersList, queryClient, refreshUsersList]
  );

  const handleSaveEdit = useCallback(
    async (input: UpdateUserInput): Promise<boolean> => {
      try {
        const updated = await updateMutation.mutateAsync(input);
        await updateUserInCache(updated);
        return true;
      } catch (err) {
        console.error('Failed to update user:', err);
        return false;
      }
    },
    [updateMutation, updateUserInCache]
  );

  const handleCreateUser = useCallback(
    async (input: CreateUserInput): Promise<CreateUserResult> => {
      if (!input.name.trim()) {
        setCreateError('El nombre es obligatorio');
        return { ok: false };
      }
      if (!input.email.trim()) {
        setCreateError('El email es obligatorio');
        return { ok: false };
      }
      if (!input.password.trim() || input.password.length < 8) {
        setCreateError('La contraseña debe tener al menos 8 caracteres');
        return { ok: false };
      }

      try {
        setCreateError('');
        const user = await createMutation.mutateAsync({
          name: input.name.trim(),
          email: input.email.trim(),
          password: input.password,
          role: input.role,
        });

        await upsertUserInCache(user);
        return { ok: true, user };
      } catch (err) {
        console.error('Failed to create user:', err);
        setCreateError(
          resolveErrorMessage(
            err,
            [
              {
                message: 'El email no es válido',
                patterns: ['invalid email', 'email inválido'],
              },
              {
                message: 'Ya existe un usuario con ese email',
                patterns: ['already exists', 'already in use', 'duplicate'],
              },
            ],
            'Error al crear usuario. Intenta nuevamente.'
          )
        );
        return { ok: false };
      }
    },
    [createMutation, upsertUserInCache]
  );

  const requestDeleteUser = useCallback((target: UserDeleteTarget) => {
    setDeleteError('');
    setDeleteTarget(target);
  }, []);

  const clearDeleteState = useCallback(() => {
    setDeleteError('');
    setDeleteTarget(null);
  }, []);

  const handleConfirmDeleteUser = useCallback(async (): Promise<boolean> => {
    if (!deleteTarget) return false;

    try {
      setDeleteError('');
      await deleteMutation.mutateAsync({ id: deleteTarget.id });

      await queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
      queryClient.setQueryData<User[]>(USERS_QUERY_KEY, (prev) => {
        const prevUsers = Array.isArray(prev) ? prev : [];
        return prevUsers.filter((u) => u.id !== deleteTarget.id);
      });
      invalidateUsersList();

      setDeleteTarget(null);
      return true;
    } catch (err) {
      console.error('Failed to delete user:', err);
      setDeleteError('No se pudo eliminar usuario. Intenta nuevamente.');
      return false;
    }
  }, [deleteTarget, deleteMutation, invalidateUsersList, queryClient]);

  return {
    saving,
    deleting,
    createError,
    setCreateError,
    deleteError,
    deleteTarget,
    handleSaveEdit,
    handleCreateUser,
    requestDeleteUser,
    clearDeleteState,
    handleConfirmDeleteUser,
  };
};
