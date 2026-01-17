import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trpc } from '../lib/trpc';

export function useSchedules(classroomId: string) {
  const queryClient = useQueryClient();

  const schedulesQuery = useQuery({
    queryKey: ['classrooms', classroomId, 'schedules'],
    queryFn: () => trpc.schedules.getByClassroom.query({ classroomId }),
    enabled: !!classroomId,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      classroomId: string;
      groupId: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    }) => trpc.schedules.create.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classrooms', classroomId, 'schedules'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => trpc.schedules.delete.mutate({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classrooms', classroomId, 'schedules'] });
    },
  });

  return {
    schedules: schedulesQuery.data ?? [],
    isLoading: schedulesQuery.isLoading,
    error: schedulesQuery.error,
    createSchedule: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    deleteSchedule: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    refetch: schedulesQuery.refetch,
  };
}
