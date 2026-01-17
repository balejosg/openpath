import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trpc } from '../lib/trpc';

export function useClassrooms() {
  const queryClient = useQueryClient();

  const classroomsQuery = useQuery({
    queryKey: ['classrooms'],
    queryFn: () => trpc.classrooms.list.query(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; displayName: string; defaultGroupId?: string }) =>
      trpc.classrooms.create.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classrooms'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => trpc.classrooms.delete.mutate({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classrooms'] });
    },
  });

  const setActiveGroupMutation = useMutation({
    mutationFn: (data: { id: string; groupId: string | null }) =>
      trpc.classrooms.setActiveGroup.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classrooms'] });
    },
  });

  return {
    classrooms: classroomsQuery.data ?? [],
    isLoading: classroomsQuery.isLoading,
    error: classroomsQuery.error,
    createClassroom: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    deleteClassroom: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    setActiveGroup: setActiveGroupMutation.mutateAsync,
    isSettingActiveGroup: setActiveGroupMutation.isPending,
    refetch: classroomsQuery.refetch,
  };
}

export function useClassroomMachines(classroomId: string | undefined) {
  // If classroomId is provided, filter by it; if undefined, the API lists all machines
  // Only disable if classroomId is an empty string (invalid input)
  const shouldFetch = classroomId !== '';
  
  return useQuery({
    queryKey: ['classrooms', classroomId ?? 'all', 'machines'],
    queryFn: () => trpc.classrooms.listMachines.query({ classroomId }),
    enabled: shouldFetch,
  });
}
