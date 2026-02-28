import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import type { ScheduleWithPermissions } from '../types';

const DAY_OPTIONS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
] as const;

/** Round minutes down to nearest 15 */
function roundTo15(time: string): string {
  const [hRaw, mRaw] = time.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  const minutes = Number.isFinite(m) ? m : 0;
  const hours = Number.isFinite(h) ? h : 0;
  const rounded = Math.floor(minutes / 15) * 15;
  return `${String(hours).padStart(2, '0')}:${String(rounded).padStart(2, '0')}`;
}

/** Generate HH:MM options in 15-min steps */
function timeOptions(): string[] {
  const opts: string[] = [];
  for (let h = 7; h <= 21; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 21 && m > 0) break;
      opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return opts;
}

const TIME_OPTIONS = timeOptions();

function normalizeDayOfWeek(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(n)) return null;
  if (n < 1 || n > 5) return null;
  return n;
}

interface GroupInfo {
  id: string;
  displayName: string;
}

interface ScheduleFormModalProps {
  /** null = create mode; populated = edit mode */
  schedule: ScheduleWithPermissions | null;
  /** Pre-filled day when creating from calendar click */
  defaultDay?: number;
  /** Pre-filled start time when creating from calendar click */
  defaultStartTime?: string;
  groups: GroupInfo[];
  saving: boolean;
  error: string;
  onSave: (data: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    groupId: string;
  }) => void;
  onClose: () => void;
}

const ScheduleFormModal: React.FC<ScheduleFormModalProps> = ({
  schedule,
  defaultDay,
  defaultStartTime,
  groups,
  saving,
  error,
  onSave,
  onClose,
}) => {
  const isEdit = schedule !== null;

  const [dayOfWeek, setDayOfWeek] = useState<number | null>(
    normalizeDayOfWeek(schedule?.dayOfWeek) ?? normalizeDayOfWeek(defaultDay) ?? null
  );
  const [startTime, setStartTime] = useState<string>(
    schedule?.startTime ?? (defaultStartTime ? roundTo15(defaultStartTime) : '08:00')
  );
  const [endTime, setEndTime] = useState<string>(
    schedule?.endTime ??
      (() => {
        const base = defaultStartTime ? roundTo15(defaultStartTime) : '08:00';
        const [hRaw] = base.split(':');
        const h = Number(hRaw);
        const hour = Number.isFinite(h) ? h : 8;
        return `${String(Math.min(hour + 1, 21)).padStart(2, '0')}:00`;
      })()
  );
  const [groupId, setGroupId] = useState<string>(schedule?.groupId ?? groups.at(0)?.id ?? '');
  const [localError, setLocalError] = useState('');

  // Sync error prop
  useEffect(() => {
    if (error) setLocalError(error);
  }, [error]);

  const handleSubmit = () => {
    setLocalError('');
    if (!dayOfWeek) {
      setLocalError('Selecciona un dia');
      return;
    }
    if (!groupId) {
      setLocalError('Selecciona un grupo');
      return;
    }
    if (startTime >= endTime) {
      setLocalError('La hora de fin debe ser posterior a la de inicio');
      return;
    }
    onSave({ dayOfWeek, startTime, endTime, groupId });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800">
            {isEdit ? 'Editar Horario' : 'Nuevo Horario'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Day */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Día</label>
            <div className="flex gap-1.5">
              {DAY_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDayOfWeek(d.value)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    dayOfWeek === d.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  {d.label.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Time range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="schedule-start"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Hora Inicio
              </label>
              <select
                id="schedule-start"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="schedule-end"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Hora Fin
              </label>
              <select
                id="schedule-end"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {TIME_OPTIONS.filter((t) => t > startTime).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Group */}
          <div>
            <label
              htmlFor="schedule-group"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Grupo de Reglas
            </label>
            <select
              id="schedule-group"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {groups.length === 0 && <option value="">Sin grupos disponibles</option>}
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Error */}
          {localError && (
            <p className="text-red-500 text-sm flex items-center gap-1">
              <AlertCircle size={14} /> {localError}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {isEdit ? 'Guardar Cambios' : 'Crear Horario'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleFormModal;
