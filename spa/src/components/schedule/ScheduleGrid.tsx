import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';

interface ScheduleSlot {
  start: string;
  end: string;
}

interface Schedule {
  id: string;
  classroomId: string;
  groupId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isMine?: boolean;
  canEdit?: boolean;
}

interface ScheduleGridProps {
  classroomId: string;
}

const DAY_NAMES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const START_HOUR = '08:00';
const END_HOUR = '15:00';
const SLOT_MINUTES = 60;

export function ScheduleGrid({ classroomId }: ScheduleGridProps) {
  const allGroups = useAppStore((s) => s.allGroups);

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [reserveModalOpen, setReserveModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{
    day: number;
    start: string;
    end: string;
  } | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');

  const loadSchedules = useCallback(async () => {
    try {
      const result = (await trpc.schedules.getByClassroom.query({ classroomId })) as {
        schedules: Schedule[];
      };
      setSchedules(result.schedules);
    } catch (err) {
      console.error('Failed to load schedules:', err);
      setSchedules([]);
    } finally {
      setIsLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  const generateTimeSlots = (
    startHour: string,
    endHour: string,
    intervalMinutes: number,
  ): ScheduleSlot[] => {
    const slots: ScheduleSlot[] = [];
    const startParts = startHour.split(':').map(Number);
    let h = startParts[0] ?? 0;
    let m = startParts[1] ?? 0;

    const endParts = endHour.split(':').map(Number);
    const endH = endParts[0] ?? 0;
    const endM = endParts[1] ?? 0;

    while (h < endH || (h === endH && m < endM)) {
      const start = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      m += intervalMinutes;
      if (m >= 60) {
        h += Math.floor(m / 60);
        m = m % 60;
      }
      const end = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      slots.push({ start, end });
    }

    return slots;
  };

  const findScheduleForSlot = (
    dayOfWeek: number,
    startTime: string,
    endTime: string,
  ): Schedule | null => {
    return (
      schedules.find(
        (s) => s.dayOfWeek === dayOfWeek && s.startTime === startTime && s.endTime === endTime,
      ) ?? null
    );
  };

  const handleCellClick = (day: number, start: string, end: string) => {
    setSelectedSlot({ day, start, end });
    setSelectedGroupId('');
    setReserveModalOpen(true);
  };

  const handleReserve = useCallback(async () => {
    if (!selectedSlot || !selectedGroupId) return;

    try {
      await trpc.schedules.create.mutate({
        classroomId,
        groupId: selectedGroupId,
        dayOfWeek: selectedSlot.day,
        startTime: selectedSlot.start,
        endTime: selectedSlot.end,
      });
      setReserveModalOpen(false);
      setSelectedSlot(null);
      setSelectedGroupId('');
      await loadSchedules();
    } catch (err) {
      console.error('Failed to create schedule:', err);
    }
  }, [classroomId, loadSchedules, selectedGroupId, selectedSlot]);

  const handleDeleteSchedule = useCallback(
    async (scheduleId: string) => {
      if (!confirm('¿Eliminar esta reserva?')) return;
      try {
        await trpc.schedules.delete.mutate({ id: scheduleId });
        await loadSchedules();
      } catch (err) {
        console.error('Failed to delete schedule:', err);
      }
    },
    [loadSchedules],
  );

  const timeSlots = generateTimeSlots(START_HOUR, END_HOUR, SLOT_MINUTES);

  if (isLoading) {
    return (
      <div className="p-6 text-center text-slate-600">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="grid grid-cols-[100px_repeat(5,1fr)] gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 flex items-center justify-center">
              Hora
            </div>
            {DAY_NAMES.slice(1).map((day) => (
              <div
                key={day}
                className="bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 text-center"
              >
                {day}
              </div>
            ))}

            {timeSlots.map((slot) => (
              <>
                <div
                  key={`time-${slot.start}`}
                  className="bg-white px-4 py-3 text-xs text-slate-600 flex items-center justify-center"
                >
                  {slot.start} - {slot.end}
                </div>
                {[1, 2, 3, 4, 5].map((day) => {
                  const schedule = findScheduleForSlot(day, slot.start, slot.end);

                  if (schedule) {
                    const group = allGroups.find((g) => g.name === schedule.groupId);
                    const canEdit = schedule.canEdit || schedule.isMine || false;

                    return (
                      <div
                        key={`${day}-${slot.start}`}
                        className={cn(
                          'bg-white px-3 py-2 min-h-[60px] relative group',
                          schedule.isMine ? 'bg-blue-50' : 'bg-slate-50',
                        )}
                      >
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {group?.name ?? schedule.groupId}
                        </div>
                        {canEdit && (
                          <button
                            onClick={() => handleDeleteSchedule(schedule.id)}
                            className="absolute top-1 right-1 w-6 h-6 rounded bg-red-100 text-red-600 hover:bg-red-200 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                            title="Eliminar"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <button
                      key={`${day}-${slot.start}`}
                      type="button"
                      onClick={() => { handleCellClick(day, slot.start, slot.end); }}
                      className="bg-white px-3 py-2 min-h-[60px] hover:bg-blue-50 transition-colors group flex items-center justify-center"
                      title="Click para reservar"
                    >
                      <span className="text-2xl text-slate-300 group-hover:text-blue-400 transition-colors">
                        +
                      </span>
                    </button>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      </div>

      {allGroups.length > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-slate-700">Grupos disponibles:</span>
          {allGroups.map((g) => (
            <span key={g.name} className="px-2 py-1 bg-slate-100 text-slate-700 rounded">
              {g.name}
            </span>
          ))}
        </div>
      )}

      <Modal
        open={reserveModalOpen}
        onClose={() => { setReserveModalOpen(false); }}
        title={
          selectedSlot
            ? `Reservar ${DAY_NAMES[selectedSlot.day]} ${selectedSlot.start}-${selectedSlot.end}`
            : 'Reservar'
        }
      >
        <div className="space-y-4">
          {allGroups.length === 0 ? (
            <p className="text-sm text-slate-600">No hay grupos disponibles para reservar.</p>
          ) : (
            <>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">
                  Selecciona grupo
                </label>
                <select
                  value={selectedGroupId}
                  onChange={(e) => { setSelectedGroupId(e.target.value); }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Seleccionar --</option>
                  {allGroups.map((g) => (
                    <option key={g.name} value={g.name}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => { setReserveModalOpen(false); }}>
                  Cancelar
                </Button>
                <Button onClick={() => void handleReserve()} disabled={!selectedGroupId}>
                  Reservar
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
