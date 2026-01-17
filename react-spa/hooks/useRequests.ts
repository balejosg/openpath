import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trpc } from '../lib/trpc';

export function useRequests(status?: string) {
  const queryClient = useQueryClient();

  const requestsQuery = useQuery({
    queryKey: ['requests', status],
    queryFn: () => trpc.requests.list.query({ status: status as any }),
  });

  const approveMutation = useMutation({
    mutationFn: (data: { id: string; groupId?: string }) =>
      trpc.requests.approve.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (data: { id: string; reason?: string }) =>
      trpc.requests.reject.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => trpc.requests.delete.mutate({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });

  return {
    requests: requestsQuery.data ?? [],
    isLoading: requestsQuery.isLoading,
    error: requestsQuery.error,
    approveRequest: approveMutation.mutateAsync,
    isApproving: approveMutation.isPending,
    rejectRequest: rejectMutation.mutateAsync,
    isRejecting: rejectMutation.isPending,
    deleteRequest: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    refetch: requestsQuery.refetch,
  };
}
