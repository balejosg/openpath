import { useQuery } from '@tanstack/react-query';
import { trpc } from '../lib/trpc';

interface DashboardStats {
  groupCount: number;
  domainCount: number;
  pendingRequestsCount: number;
  classroomCount: number;
}

export function useDashboardStats() {
  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => trpc.groups.list.query(),
  });

  const requestsQuery = useQuery({
    queryKey: ['requests', 'pending'],
    queryFn: () => trpc.requests.list.query({ status: 'pending' }),
  });

  const classroomsQuery = useQuery({
    queryKey: ['classrooms'],
    queryFn: () => trpc.classrooms.list.query(),
  });

  const isLoading = groupsQuery.isLoading ||
                    requestsQuery.isLoading ||
                    classroomsQuery.isLoading;

  const error = groupsQuery.error ||
                requestsQuery.error ||
                classroomsQuery.error;

  const stats: DashboardStats = {
    groupCount: groupsQuery.data?.length ?? 0,
    domainCount: groupsQuery.data?.reduce(
      (sum, g) => sum + (g.whitelistCount ?? 0) + (g.blockedSubdomainCount ?? 0) + (g.blockedPathCount ?? 0), 0
    ) ?? 0,
    pendingRequestsCount: requestsQuery.data?.length ?? 0,
    classroomCount: classroomsQuery.data?.length ?? 0,
  };

  return {
    stats,
    isLoading,
    error,
    groups: groupsQuery.data ?? [],
    pendingRequests: requestsQuery.data ?? [],
  };
}
