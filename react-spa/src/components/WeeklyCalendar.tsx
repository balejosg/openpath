import React, { useMemo } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import type { ScheduleWithPermissions } from '../types';
import { parseTimeOfDayToMinutes } from '../lib/time-of-day';
import { resolveGroupDisplayName } from './groups/GroupLabel';

const DAYS = [
  { key: 1, short: 'Lun', full: 'Lunes' },
  { key: 2, short: 'Mar', full: 'Martes' },
  { key: 3, short: 'Mié', full: 'Miércoles' },
  { key: 4, short: 'Jue', full: 'Jueves' },
  { key: 5, short: 'Vie', full: 'Viernes' },
] as const;

// Time grid: 07:00 – 21:00 in 1-hour visual rows
const START_HOUR = 7;
const END_HOUR = 21;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

// Group colors (rotate for visual distinction)
const GROUP_COLORS = [
  {
    bg: 'bg-blue-100',
    border: 'border-blue-300',
    text: 'text-blue-800',
    hover: 'hover:bg-blue-200',
  },
  {
    bg: 'bg-emerald-100',
    border: 'border-emerald-300',
    text: 'text-emerald-800',
    hover: 'hover:bg-emerald-200',
  },
  {
    bg: 'bg-violet-100',
    border: 'border-violet-300',
    text: 'text-violet-800',
    hover: 'hover:bg-violet-200',
  },
  {
    bg: 'bg-amber-100',
    border: 'border-amber-300',
    text: 'text-amber-800',
    hover: 'hover:bg-amber-200',
  },
  {
    bg: 'bg-rose-100',
    border: 'border-rose-300',
    text: 'text-rose-800',
    hover: 'hover:bg-rose-200',
  },
  {
    bg: 'bg-cyan-100',
    border: 'border-cyan-300',
    text: 'text-cyan-800',
    hover: 'hover:bg-cyan-200',
  },
  {
    bg: 'bg-orange-100',
    border: 'border-orange-300',
    text: 'text-orange-800',
    hover: 'hover:bg-orange-200',
  },
];

// Style for blocks the current user cannot edit.
// This keeps the schedule visible while clearly marking it as reserved.
const RESERVED_COLOR = {
  bg: 'bg-slate-100',
  border: 'border-slate-300',
  text: 'text-slate-700',
  hover: 'hover:bg-slate-200',
};

interface GroupInfo {
  id: string;
  displayName: string;
}

interface WeeklyCalendarProps {
  schedules: ScheduleWithPermissions[];
  groups: GroupInfo[];
  onAddClick: (dayOfWeek: number, startTime: string) => void;
  onEditClick: (schedule: ScheduleWithPermissions) => void;
  onDeleteClick: (schedule: ScheduleWithPermissions) => void;
}

function minutesToPx(minutes: number, rowHeight: number): number {
  return (minutes / 60) * rowHeight;
}

const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({
  schedules,
  groups,
  onAddClick,
  onEditClick,
  onDeleteClick,
}) => {
  const ROW_HEIGHT = 64; // px per hour

  // Build a stable groupId → color index map
  const groupColorMap = useMemo(() => {
    const uniqueIds = [...new Set(schedules.map((s) => s.groupId))];
    const map = new Map<string, number>();
    uniqueIds.forEach((id, i) => map.set(id, i % GROUP_COLORS.length));
    return map;
  }, [schedules]);

  const groupNameMap = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) => map.set(g.id, g.displayName));
    return map;
  }, [groups]);

  // Bucket schedules by dayOfWeek
  const byDay = useMemo(() => {
    const map = new Map<number, ScheduleWithPermissions[]>();
    for (const s of schedules) {
      const list = map.get(s.dayOfWeek) ?? [];
      list.push(s);
      map.set(s.dayOfWeek, list);
    }
    return map;
  }, [schedules]);

  // Compute the dates for the current week (Monday–Friday)
  const weekDates = useMemo(() => {
    const today = new Date();
    const dow = today.getDay(); // 0=Sun … 6=Sat
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    return DAYS.map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.getDate();
    });
  }, []);

  // Month label (handles week spanning two months)
  const weekMonthLabel = useMemo(() => {
    const today = new Date();
    const dow = today.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const fmt = new Intl.DateTimeFormat('es-ES', { month: 'long' });
    const mon = fmt.format(monday);
    const fri = fmt.format(friday);
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return mon === fri ? cap(mon) : `${cap(mon)} – ${cap(fri)}`;
  }, []);

  // Which column is "today"? (1=Mon … 5=Fri, null if weekend)
  const todayKey = useMemo(() => {
    const d = new Date().getDay();
    return d >= 1 && d <= 5 ? d : null;
  }, []);

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm">
      {/* Month label */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
        {weekMonthLabel}
      </div>
      <div className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-slate-200 bg-slate-50">
        <div className="p-2 text-xs font-semibold text-slate-400 text-center flex items-center justify-center">
          Hora
        </div>
        {DAYS.map((d, i) => {
          const isToday = todayKey === d.key;
          return (
            <div
              key={d.key}
              className={`p-2 text-center border-l border-slate-200 flex flex-col items-center justify-center gap-0.5 ${isToday ? 'bg-blue-50' : ''}`}
            >
              <span
                className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-blue-600' : 'text-slate-500'}`}
              >
                <span className="hidden md:inline">{d.full}</span>
                <span className="inline md:hidden">{d.short}</span>
              </span>
              <span
                className={`text-lg font-bold leading-tight ${isToday ? 'text-white bg-blue-600 w-8 h-8 rounded-full flex items-center justify-center' : 'text-slate-800'}`}
              >
                {weekDates[i]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Time grid body */}
      <div className="max-h-[520px] md:max-h-[640px] overflow-y-auto">
        <div
          className="grid grid-cols-[60px_repeat(5,1fr)] relative"
          style={{ height: HOURS.length * ROW_HEIGHT }}
        >
          {/* Time labels column */}
          <div className="relative border-r border-slate-200">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute w-full text-right pr-2 text-[10px] text-slate-400 -translate-y-1/2"
                style={{ top: (h - START_HOUR) * ROW_HEIGHT }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map((d) => {
            const daySchedules = byDay.get(d.key) ?? [];

            return (
              <div key={d.key} className="relative border-l border-slate-200">
                {/* Hour gridlines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-slate-100 group/cell cursor-pointer"
                    style={{ top: (h - START_HOUR) * ROW_HEIGHT, height: ROW_HEIGHT }}
                    onClick={() => onAddClick(d.key, `${String(h).padStart(2, '0')}:00`)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Agregar ${d.full} ${String(h).padStart(2, '0')}:00`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onAddClick(d.key, `${String(h).padStart(2, '0')}:00`);
                      }
                    }}
                  >
                    {/* "+" hint on hover */}
                    <div className="opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-center justify-center h-full">
                      <Plus size={14} className="text-slate-300" />
                    </div>
                  </div>
                ))}

                {/* Schedule blocks */}
                {daySchedules.map((s) => {
                  const startAbs = parseTimeOfDayToMinutes(s.startTime);
                  const endAbs = parseTimeOfDayToMinutes(s.endTime);
                  if (startAbs === null || endAbs === null) return null;

                  const startMin = startAbs - START_HOUR * 60;
                  const endMin = endAbs - START_HOUR * 60;
                  const visibleStartMin = Math.max(startMin, 0);
                  const visibleEndMin = Math.min(endMin, (END_HOUR - START_HOUR) * 60);
                  const durationMin = visibleEndMin - visibleStartMin;
                  if (durationMin <= 0) return null;

                  const top = minutesToPx(visibleStartMin, ROW_HEIGHT);
                  const height = minutesToPx(durationMin, ROW_HEIGHT);
                  const colorIdx = groupColorMap.get(s.groupId) ?? 0;
                  const canEdit = s.canEdit;
                  const color = canEdit
                    ? (GROUP_COLORS[colorIdx] ?? GROUP_COLORS[0])
                    : RESERVED_COLOR;
                  const knownGroupName = groupNameMap.get(s.groupId);
                  const group = knownGroupName
                    ? { id: s.groupId, name: knownGroupName, displayName: knownGroupName }
                    : null;
                  const groupName = resolveGroupDisplayName({
                    groupId: s.groupId,
                    group,
                    source: 'schedule',
                    revealUnknownId: canEdit,
                  });

                  return (
                    <div
                      key={s.id}
                      className={`absolute inset-x-1 rounded-md border ${color.bg} ${color.border} ${color.hover} overflow-hidden z-10 transition-colors group/block ${canEdit ? 'cursor-pointer' : 'cursor-default opacity-90'
                        }`}
                      style={{ top, height: Math.max(height, 20) }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canEdit) onEditClick(s);
                      }}
                      onKeyDown={(e) => {
                        if (!canEdit) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onEditClick(s);
                        }
                      }}
                      role={canEdit ? 'button' : undefined}
                      tabIndex={canEdit ? 0 : -1}
                      aria-label={
                        canEdit
                          ? `Editar ${groupName} ${s.startTime}-${s.endTime}`
                          : `${groupName} ${s.startTime}-${s.endTime}`
                      }
                      data-testid={`schedule-block-${s.id}`}
                      title={`${groupName}\n${s.startTime} – ${s.endTime}`}
                    >
                      <div className="px-1.5 py-0.5 h-full flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-0.5">
                          <span
                            className={`text-[10px] font-semibold leading-tight truncate ${color.text}`}
                          >
                            {groupName}
                          </span>
                          {s.canEdit && (
                            <div className="flex gap-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity shrink-0">
                              <button
                                className="p-0.5 rounded hover:bg-white/60"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditClick(s);
                                }}
                                title="Editar"
                              >
                                <Edit2 size={10} className={color.text} />
                              </button>
                              <button
                                className="p-0.5 rounded hover:bg-red-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteClick(s);
                                }}
                                title="Eliminar"
                              >
                                <Trash2 size={10} className="text-red-500" />
                              </button>
                            </div>
                          )}
                        </div>
                        {height >= 32 && (
                          <span className={`text-[9px] ${color.text} opacity-70`}>
                            {s.startTime} – {s.endTime}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default WeeklyCalendar;
