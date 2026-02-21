import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { trpc } from '../lib/trpc';

type GroupsListOutput = Awaited<ReturnType<typeof trpc.groups.list.query>>;
type AllowedGroup = GroupsListOutput[number];

const EMPTY_GROUPS: GroupsListOutput = [];

export interface AllowedGroupOption {
  value: string;
  label: string;
}

export function useAllowedGroups() {
  const query = useQuery({
    queryKey: ['groups.list'],
    queryFn: () => trpc.groups.list.query(),
  });

  const groups = query.data ?? EMPTY_GROUPS;

  const groupById = useMemo(() => {
    return new Map<string, AllowedGroup>(groups.map((g) => [g.id, g] as const));
  }, [groups]);

  const options = useMemo<AllowedGroupOption[]>(() => {
    return groups.map((g) => ({
      value: g.id,
      label: g.displayName || g.name,
    }));
  }, [groups]);

  const error = query.error ? query.error.message : null;
  const isLoading = query.status === 'pending' || query.fetchStatus === 'fetching';

  return {
    groups,
    groupById,
    options,
    isLoading,
    error,
    refetch: query.refetch,
  };
}
