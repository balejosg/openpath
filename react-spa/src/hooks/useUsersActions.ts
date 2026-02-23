import { useCallback, useState } from 'react';
import { resolveErrorMessage } from '../lib/error-utils';
import { trpc } from '../lib/trpc';

export interface UserDeleteTarget {
  id: string;
  name: string;
}

interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'teacher';
}

type CreatedUser = Awaited<ReturnType<typeof trpc.users.create.mutate>>;

export type CreateUserResult = { ok: true; user: CreatedUser } | { ok: false };

interface UpdateUserInput {
  id: string;
  name: string;
  email: string;
}

interface UseUsersActionsParams {
  fetchUsers: () => Promise<void>;
}

export const useUsersActions = ({ fetchUsers }: UseUsersActionsParams) => {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [createError, setCreateError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserDeleteTarget | null>(null);

  const handleSaveEdit = useCallback(
    async (input: UpdateUserInput): Promise<boolean> => {
      try {
        setSaving(true);
        await trpc.users.update.mutate(input);
        await fetchUsers();
        return true;
      } catch (err) {
        console.error('Failed to update user:', err);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [fetchUsers]
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
        setSaving(true);
        setCreateError('');
        const user = await trpc.users.create.mutate({
          name: input.name.trim(),
          email: input.email.trim(),
          password: input.password,
          role: input.role,
        });
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
      } finally {
        setSaving(false);
      }
    },
    []
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
      setDeleting(true);
      setDeleteError('');
      await trpc.users.delete.mutate({ id: deleteTarget.id });
      await fetchUsers();
      setDeleteTarget(null);
      return true;
    } catch (err) {
      console.error('Failed to delete user:', err);
      setDeleteError('No se pudo eliminar usuario. Intenta nuevamente.');
      return false;
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, fetchUsers]);

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
