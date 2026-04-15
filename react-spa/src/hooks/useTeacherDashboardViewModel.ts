import { useCallback, useMemo, useState } from 'react';
import { trpc } from '../lib/trpc';
import { isTeacherGroupsFeatureEnabled } from '../lib/auth';
import {
  selectActiveClassroomRowsFromModels,
  selectClassroomControlConfirmation,
} from '../lib/classroom-selectors';
import { reportError } from '../lib/reportError';
import { useAllowedGroups } from './useAllowedGroups';
import { useClassroomListModelsQuery } from './useClassroomsList';

export function useTeacherDashboardViewModel() {
  const teacherGroupsEnabled = isTeacherGroupsFeatureEnabled();
  const shouldPoll = import.meta.env.MODE !== 'test';
  const {
    data: classrooms,
    loading: classroomsLoading,
    error: classroomsError,
    refetchClassrooms,
  } = useClassroomListModelsQuery({
    refetchIntervalMs: shouldPoll ? 30000 : false,
    refetchOnWindowFocus: shouldPoll,
  });

  const {
    groups,
    groupById,
    isLoading: groupsLoading,
    error: groupsQueryError,
  } = useAllowedGroups();

  const groupsError = groupsQueryError ? 'No se pudieron cargar tus grupos' : null;

  const [selectedClassroomForControl, setSelectedClassroomForControl] = useState('');
  const [selectedGroupForControl, setSelectedGroupForControl] = useState('');
  const [controlLoading, setControlLoading] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);
  const [controlConfirm, setControlConfirm] = useState<{
    classroomId: string;
    nextGroupId: string | null;
    currentName: string;
    nextName: string;
  } | null>(null);

  const activeClassrooms = useMemo(
    () => selectActiveClassroomRowsFromModels(classrooms, groupById),
    [classrooms, groupById]
  );

  const applyControlChange = useCallback(
    async (classroomId: string, nextGroupId: string | null) => {
      setControlLoading(true);
      setControlError(null);
      try {
        await trpc.classrooms.setActiveGroup.mutate({
          id: classroomId,
          groupId: nextGroupId,
        });
        await refetchClassrooms();
        setSelectedClassroomForControl('');
        setSelectedGroupForControl('');
        return true;
      } catch (e) {
        reportError('Failed to apply active group:', e);
        setControlError('Error al aplicar el grupo al aula');
        return false;
      } finally {
        setControlLoading(false);
      }
    },
    [refetchClassrooms]
  );

  const handleTakeControl = useCallback(() => {
    if (!selectedClassroomForControl) return;

    const nextGroupId = selectedGroupForControl || null;
    const confirmation = selectClassroomControlConfirmation({
      classrooms,
      groupById,
      classroomId: selectedClassroomForControl,
      nextGroupId,
    });

    if (confirmation) {
      setControlConfirm(confirmation);
      return;
    }

    void applyControlChange(selectedClassroomForControl, nextGroupId);
  }, [
    applyControlChange,
    classrooms,
    groupById,
    selectedClassroomForControl,
    selectedGroupForControl,
  ]);

  const handleReleaseClass = useCallback(
    async (classroomId: string) => {
      try {
        await trpc.classrooms.setActiveGroup.mutate({
          id: classroomId,
          groupId: null,
        });
        await refetchClassrooms();
      } catch (e) {
        reportError('Failed to release classroom:', e);
      }
    },
    [refetchClassrooms]
  );

  return {
    teacherGroupsEnabled,
    classrooms,
    classroomsLoading,
    classroomsError,
    refetchClassrooms,
    groups,
    groupById,
    groupsLoading,
    groupsError,
    selectedClassroomForControl,
    setSelectedClassroomForControl,
    selectedGroupForControl,
    setSelectedGroupForControl,
    controlLoading,
    controlError,
    setControlError,
    controlConfirm,
    setControlConfirm,
    activeClassrooms,
    applyControlChange,
    handleTakeControl,
    handleReleaseClass,
  };
}
