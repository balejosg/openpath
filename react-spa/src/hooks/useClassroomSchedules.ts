import { useCallback, useEffect, useState } from 'react';
import type { ScheduleWithPermissions } from '../types';
import { trpc } from '../lib/trpc';
import { resolveErrorMessage } from '../lib/error-utils';

function formatScheduleError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : '';
  return resolveErrorMessage(
    err,
    [
      {
        message: 'Ese tramo horario ya est\u00e1 reservado',
        patterns: ['time slot is already reserved', 'already reserved'],
      },
    ],
    raw || fallback
  );
}

interface ScheduleFormData {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  groupId: string;
}

interface UseClassroomSchedulesParams {
  selectedClassroomId: string | null;
}

export const useClassroomSchedules = ({ selectedClassroomId }: UseClassroomSchedulesParams) => {
  const [schedules, setSchedules] = useState<ScheduleWithPermissions[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleWithPermissions | null>(null);
  const [scheduleFormDay, setScheduleFormDay] = useState<number | undefined>(undefined);
  const [scheduleFormStartTime, setScheduleFormStartTime] = useState<string | undefined>(undefined);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleDeleteTarget, setScheduleDeleteTarget] = useState<ScheduleWithPermissions | null>(
    null
  );

  const fetchSchedules = useCallback(async (classroomId: string) => {
    try {
      setLoadingSchedules(true);
      setScheduleError('');
      const result = await trpc.schedules.getByClassroom.query({ classroomId });
      setSchedules(result.schedules);
    } catch (err) {
      console.error('Failed to fetch schedules:', err);
      setScheduleError('Error al cargar horarios');
      setSchedules([]);
    } finally {
      setLoadingSchedules(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedClassroomId) {
      setSchedules([]);
      return;
    }

    void fetchSchedules(selectedClassroomId);
  }, [selectedClassroomId, fetchSchedules]);

  const openScheduleCreate = useCallback((dayOfWeek?: number, startTime?: string) => {
    setScheduleError('');
    setEditingSchedule(null);
    setScheduleFormDay(dayOfWeek);
    setScheduleFormStartTime(startTime);
    setScheduleFormOpen(true);
  }, []);

  const openScheduleEdit = useCallback((schedule: ScheduleWithPermissions) => {
    setScheduleError('');
    setEditingSchedule(schedule);
    setScheduleFormDay(undefined);
    setScheduleFormStartTime(undefined);
    setScheduleFormOpen(true);
  }, []);

  const closeScheduleForm = useCallback(() => {
    if (scheduleSaving) return;
    setScheduleFormOpen(false);
    setEditingSchedule(null);
    setScheduleFormDay(undefined);
    setScheduleFormStartTime(undefined);
    setScheduleError('');
  }, [scheduleSaving]);

  const handleScheduleSave = useCallback(
    async (data: ScheduleFormData) => {
      if (!selectedClassroomId) return;

      try {
        setScheduleSaving(true);
        setScheduleError('');
        if (editingSchedule) {
          await trpc.schedules.update.mutate({
            id: editingSchedule.id,
            dayOfWeek: data.dayOfWeek,
            startTime: data.startTime,
            endTime: data.endTime,
            groupId: data.groupId,
          });
        } else {
          await trpc.schedules.create.mutate({
            classroomId: selectedClassroomId,
            dayOfWeek: data.dayOfWeek,
            startTime: data.startTime,
            endTime: data.endTime,
            groupId: data.groupId,
          });
        }

        await fetchSchedules(selectedClassroomId);
        setScheduleFormOpen(false);
        setEditingSchedule(null);
        setScheduleFormDay(undefined);
        setScheduleFormStartTime(undefined);
      } catch (err: unknown) {
        console.error('Failed to save schedule:', err);
        setScheduleError(formatScheduleError(err, 'Error al guardar horario'));
      } finally {
        setScheduleSaving(false);
      }
    },
    [selectedClassroomId, editingSchedule, fetchSchedules]
  );

  const requestScheduleDelete = useCallback((schedule: ScheduleWithPermissions) => {
    setScheduleError('');
    setScheduleDeleteTarget(schedule);
  }, []);

  const closeScheduleDelete = useCallback(() => {
    if (scheduleSaving) return;
    setScheduleDeleteTarget(null);
    setScheduleError('');
  }, [scheduleSaving]);

  const handleConfirmDeleteSchedule = useCallback(async () => {
    if (!selectedClassroomId || !scheduleDeleteTarget) return;

    try {
      setScheduleSaving(true);
      setScheduleError('');
      await trpc.schedules.delete.mutate({ id: scheduleDeleteTarget.id });
      await fetchSchedules(selectedClassroomId);
      setScheduleDeleteTarget(null);
    } catch (err: unknown) {
      console.error('Failed to delete schedule:', err);
      setScheduleError(formatScheduleError(err, 'Error al eliminar horario'));
    } finally {
      setScheduleSaving(false);
    }
  }, [selectedClassroomId, scheduleDeleteTarget, fetchSchedules]);

  return {
    schedules,
    loadingSchedules,
    scheduleFormOpen,
    editingSchedule,
    scheduleFormDay,
    scheduleFormStartTime,
    scheduleSaving,
    scheduleError,
    scheduleDeleteTarget,
    openScheduleCreate,
    openScheduleEdit,
    closeScheduleForm,
    handleScheduleSave,
    requestScheduleDelete,
    closeScheduleDelete,
    handleConfirmDeleteSchedule,
  };
};
