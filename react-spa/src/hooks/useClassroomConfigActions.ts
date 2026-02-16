import { useCallback, useEffect, useState } from 'react';
import type { Classroom } from '../types';
import { trpc } from '../lib/trpc';
import { resolveErrorMessage } from '../lib/error-utils';

interface UseClassroomConfigActionsParams {
  selectedClassroom: Classroom | null;
  refetchClassrooms: () => Promise<Classroom[]>;
  setSelectedClassroom: (classroom: Classroom | null) => void;
}

export const useClassroomConfigActions = ({
  selectedClassroom,
  refetchClassrooms,
  setSelectedClassroom,
}: UseClassroomConfigActionsParams) => {
  const [classroomConfigError, setClassroomConfigError] = useState('');

  useEffect(() => {
    setClassroomConfigError('');
  }, [selectedClassroom?.id]);

  const handleGroupChange = useCallback(
    async (groupId: string) => {
      if (!selectedClassroom) return;

      try {
        setClassroomConfigError('');
        await trpc.classrooms.setActiveGroup.mutate({
          id: selectedClassroom.id,
          groupId: groupId || null,
        });
        const updatedClassrooms = await refetchClassrooms();
        const updated = updatedClassrooms.find((c) => c.id === selectedClassroom.id);
        if (updated) {
          setSelectedClassroom(updated);
        }
      } catch (err) {
        console.error('Failed to update active group:', err);
      }
    },
    [selectedClassroom, refetchClassrooms, setSelectedClassroom]
  );

  const handleDefaultGroupChange = useCallback(
    async (groupId: string) => {
      if (!selectedClassroom) return;

      try {
        setClassroomConfigError('');
        await trpc.classrooms.update.mutate({
          id: selectedClassroom.id,
          defaultGroupId: groupId || null,
        });
        const updatedClassrooms = await refetchClassrooms();
        const updated = updatedClassrooms.find((c) => c.id === selectedClassroom.id);
        if (updated) {
          setSelectedClassroom(updated);
        }
      } catch (err) {
        console.error('Failed to update default group:', err);
        setClassroomConfigError(
          resolveErrorMessage(
            err,
            [
              {
                message:
                  'No puedes dejar el aula sin grupo por defecto mientras no exista un grupo activo válido.',
                patterns: ['default', 'required', '400'],
              },
            ],
            groupId === ''
              ? 'No puedes dejar el aula sin grupo por defecto mientras no exista un grupo activo válido.'
              : 'No se pudo actualizar el grupo por defecto. Intenta nuevamente.'
          )
        );
      }
    },
    [selectedClassroom, refetchClassrooms, setSelectedClassroom]
  );

  return {
    classroomConfigError,
    handleGroupChange,
    handleDefaultGroupChange,
  };
};
