import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trpc } from '../lib/trpc';

export function useGroups() {
  const queryClient = useQueryClient();

  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => trpc.groups.list.query(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; displayName: string }) =>
      trpc.groups.create.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => trpc.groups.delete.mutate({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; displayName: string; enabled: boolean }) =>
      trpc.groups.update.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  return {
    groups: groupsQuery.data ?? [],
    isLoading: groupsQuery.isLoading,
    error: groupsQuery.error,
    createGroup: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    deleteGroup: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    updateGroup: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    refetch: groupsQuery.refetch,
  };
}

export function useGroupRules(groupId: string) {
  const queryClient = useQueryClient();

  const rulesQuery = useQuery({
    queryKey: ['groups', groupId, 'rules'],
    queryFn: () => trpc.groups.listRules.query({ groupId }),
    enabled: !!groupId,
  });

  const createRuleMutation = useMutation({
    mutationFn: (data: {
      groupId: string;
      type: 'whitelist' | 'blocked_subdomain' | 'blocked_path';
      value: string;
      comment?: string;
    }) => {
      // In ClassroomPath, the method is named addRule, in OpenPath it's createRule
      // We try addRule first if createRule is not available (compatibility)
      const router = trpc.groups as any;
      const mutation = router.addRule || router.createRule;
      return mutation.mutate(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', groupId, 'rules'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] }); // Update counts
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: ({ id, groupId }: { id: string; groupId: string }) => 
      (trpc.groups.deleteRule.mutate as any)({ id, groupId }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['groups', variables.groupId, 'rules'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] }); // Update counts
    },
  });

  return {
    rules: rulesQuery.data ?? [],
    isLoading: rulesQuery.isLoading,
    error: rulesQuery.error,
    createRule: createRuleMutation.mutateAsync,
    isCreating: createRuleMutation.isPending,
    deleteRule: deleteRuleMutation.mutateAsync,
    isDeleting: deleteRuleMutation.isPending,
  };
}
