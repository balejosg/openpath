import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import type { User } from '../types';
import type { CreateUserRole } from '../lib/roles';
import { resolveTrpcErrorMessage } from '../lib/error-utils';
import { trpc } from '../lib/trpc';
import { reportError } from '../lib/reportError';
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

  const deferredInvalidate = useCallback(() => {
    // Yield to let React render the optimistic data before triggering
    // a background refetch. If the refetch fails, the rendering logic
    // now shows data independently of error state, so the grid survives.
    void Promise.resolve().then(() => {
      invalidateUsersList();
    });
  }, [invalidateUsersList]);

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
        // Can't map the response — cancel any in-flight list query so we can
        // force a fresh refetch that will include the newly created user.
        await queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
        invalidateUsersList();
        return;
      }

      // Cancel any in-flight list query synchronously so its stale response
      // cannot overwrite the optimistic data we are about to set.
      void queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
      queryClient.setQueryData<User[]>(USERS_QUERY_KEY, (prev) => {
        const prevUsers = Array.isArray(prev) ? prev : [];
        return [mapped, ...prevUsers.filter((u) => u.id !== mapped.id)];
      });
      deferredInvalidate();
    },
    [deferredInvalidate, invalidateUsersList, queryClient]
  );

  const updateUserInCache = useCallback(
    async (apiUser: unknown) => {
      const mapped = mapUnknownApiUserToUser(apiUser);
      if (!mapped) {
        await queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
        invalidateUsersList();
        return;
      }

      void queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
      queryClient.setQueryData<User[]>(USERS_QUERY_KEY, (prev) => {
        const prevUsers = Array.isArray(prev) ? prev : [];
        const idx = prevUsers.findIndex((u) => u.id === mapped.id);
        if (idx === -1) return [mapped, ...prevUsers];
        const next = [...prevUsers];
        next[idx] = mapped;
        return next;
      });
      deferredInvalidate();
    },
    [deferredInvalidate, invalidateUsersList, queryClient]
  );

  const handleSaveEdit = useCallback(
    async (input: UpdateUserInput): Promise<boolean> => {
      try {
        const updated = await updateMutation.mutateAsync(input);
        void updateUserInCache(updated);
        return true;
      } catch (err) {
        reportError('Failed to update user:', err);
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

        void upsertUserInCache(user);
        return { ok: true, user };
      } catch (err) {
        reportError('Failed to create user:', err);
        setCreateError(
          resolveTrpcErrorMessage(err, {
            badRequest: 'El email no es válido',
            conflict: 'Ya existe un usuario con ese email',
            forbidden: 'No tienes permisos para crear usuarios',
            unauthorized: 'No tienes permisos para crear usuarios',
            fallback: 'Error al crear usuario. Intenta nuevamente.',
          })
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

      void queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
      queryClient.setQueryData<User[]>(USERS_QUERY_KEY, (prev) => {
        const prevUsers = Array.isArray(prev) ? prev : [];
        return prevUsers.filter((u) => u.id !== deleteTarget.id);
      });
      deferredInvalidate();

      setDeleteTarget(null);
      return true;
    } catch (err) {
      reportError('Failed to delete user:', err);
      setDeleteError('No se pudo eliminar usuario. Intenta nuevamente.');
      return false;
    }
  }, [deleteTarget, deleteMutation, deferredInvalidate, queryClient]);

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
