import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trpc } from '../lib/trpc';

export function useUsers() {
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => trpc.users.list.query(),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => trpc.users.create.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; name?: string; email?: string; active?: boolean; password?: string }) =>
      trpc.users.update.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => trpc.users.delete.mutate({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: (data: { userId: string; role: any; groupIds: string[] }) =>
      trpc.users.assignRole.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  return {
    users: usersQuery.data ?? [],
    isLoading: usersQuery.isLoading,
    error: usersQuery.error,
    createUser: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateUser: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    deleteUser: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    assignRole: assignRoleMutation.mutateAsync,
    isAssigningRole: assignRoleMutation.isPending,
    refetch: usersQuery.refetch,
  };
}
