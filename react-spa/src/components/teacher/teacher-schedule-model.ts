import { parseTimeOfDayToMinutes } from '../../lib/time-of-day';
import type { OneOffScheduleWithPermissions, ScheduleWithPermissions } from '../../types';

export type TeacherScheduleEntryKind = 'weekly' | 'one_off';

export interface TeacherScheduleEntry {
  kind: TeacherScheduleEntryKind;
  id: string;
  schedule: ScheduleWithPermissions | OneOffScheduleWithPermissions;
  dayOfWeek: 1 | 2 | 3 | 4 | 5;
  startAt: Date;
  endAt: Date;
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  classroomId: string;
  colorKey: string;
  label: string;
  groupName: string;
  classroomName: string;
  canEdit: boolean;
  laneIndex: number;
  laneCount: number;
}

export interface TeacherScheduleFocus {
  currentEntry: TeacherScheduleEntry | null;
  nextEntry: TeacherScheduleEntry | null;
  todayEntries: TeacherScheduleEntry[];
}

interface BuildTeacherScheduleEntriesParams {
  weeklySchedules: readonly ScheduleWithPermissions[];
  oneOffSchedules: readonly OneOffScheduleWithPermissions[];
  classroomNameMap: ReadonlyMap<string, string>;
  groupNameMap: ReadonlyMap<string, string>;
  weekMonday: Date;
}

interface LaneAssignment {
  laneIndex: number;
  laneCount: number;
}

type WeekdayKey = 1 | 2 | 3 | 4 | 5;

export function getWeekMonday(date: Date): Date {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  const day = monday.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + offset);
  return monday;
}

export function buildTeacherScheduleEntries(
  params: BuildTeacherScheduleEntriesParams
): TeacherScheduleEntry[] {
  const weekMonday = getWeekMonday(params.weekMonday);
  const rawEntries: TeacherScheduleEntry[] = [
    ...buildWeeklyEntries(
      params.weeklySchedules,
      params.classroomNameMap,
      params.groupNameMap,
      weekMonday
    ),
    ...buildOneOffEntries(
      params.oneOffSchedules,
      params.classroomNameMap,
      params.groupNameMap,
      weekMonday
    ),
  ];

  const byDay = groupEntriesForLayout(rawEntries);
  const result: TeacherScheduleEntry[] = [];

  for (const dayOfWeek of [1, 2, 3, 4, 5] as const) {
    const dayEntries = byDay.get(dayOfWeek) ?? [];
    const laneAssignments = assignLanes(dayEntries);
    for (const entry of dayEntries) {
      const assignment = laneAssignments.get(entry.id) ?? { laneIndex: 0, laneCount: 1 };
      result.push({
        ...entry,
        laneIndex: assignment.laneIndex,
        laneCount: assignment.laneCount,
      });
    }
  }

  return result;
}

export function groupTeacherScheduleEntriesByDay(
  entries: readonly TeacherScheduleEntry[]
): Map<WeekdayKey, TeacherScheduleEntry[]> {
  const map = new Map<WeekdayKey, TeacherScheduleEntry[]>([
    [1, []],
    [2, []],
    [3, []],
    [4, []],
    [5, []],
  ]);

  for (const entry of entries) {
    map.get(entry.dayOfWeek)?.push(entry);
  }

  for (const list of map.values()) {
    list.sort(compareEntries);
  }

  return map;
}

export function getTeacherScheduleFocus(
  entries: readonly TeacherScheduleEntry[],
  now: Date
): TeacherScheduleFocus {
  const todayEntries = entries
    .filter((entry) => isSameLocalDate(entry.startAt, now))
    .slice()
    .sort(compareEntries);

  const [currentEntry = null] = todayEntries
    .filter(
      (entry) => entry.startAt.getTime() <= now.getTime() && now.getTime() < entry.endAt.getTime()
    )
    .sort((a, b) => a.endAt.getTime() - b.endAt.getTime() || compareEntries(a, b));

  const nextEntry: TeacherScheduleEntry | null = currentEntry
    ? null
    : (todayEntries.find((entry) => entry.startAt.getTime() > now.getTime()) ?? null);

  return {
    currentEntry,
    nextEntry,
    todayEntries,
  };
}

function buildWeeklyEntries(
  schedules: readonly ScheduleWithPermissions[],
  classroomNameMap: ReadonlyMap<string, string>,
  groupNameMap: ReadonlyMap<string, string>,
  weekMonday: Date
): TeacherScheduleEntry[] {
  return schedules.flatMap((schedule) => {
    const startMinutes = parseTimeOfDayToMinutes(schedule.startTime);
    const endMinutes = parseTimeOfDayToMinutes(schedule.endTime);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return [];
    }

    const dayOfWeek = toWeekdayKey(schedule.dayOfWeek);
    if (dayOfWeek === null) {
      return [];
    }

    const startAt = addDaysAndMinutes(weekMonday, dayOfWeek - 1, startMinutes);
    const endAt = addDaysAndMinutes(weekMonday, dayOfWeek - 1, endMinutes);
    return [
      createEntry({
        kind: 'weekly',
        id: schedule.id,
        schedule,
        classroomNameMap,
        groupNameMap,
        dayOfWeek,
        startAt,
        endAt,
        startMinutes,
        endMinutes,
      }),
    ];
  });
}

function buildOneOffEntries(
  schedules: readonly OneOffScheduleWithPermissions[],
  classroomNameMap: ReadonlyMap<string, string>,
  groupNameMap: ReadonlyMap<string, string>,
  weekMonday: Date
): TeacherScheduleEntry[] {
  const weekStart = new Date(weekMonday);
  const weekEnd = new Date(weekMonday);
  weekEnd.setDate(weekEnd.getDate() + 5);

  return schedules.flatMap((schedule) => {
    const scheduleStart = new Date(schedule.startAt);
    const scheduleEnd = new Date(schedule.endAt);
    if (Number.isNaN(scheduleStart.getTime()) || Number.isNaN(scheduleEnd.getTime())) {
      return [];
    }
    if (scheduleEnd.getTime() <= scheduleStart.getTime()) {
      return [];
    }
    if (
      scheduleEnd.getTime() <= weekStart.getTime() ||
      scheduleStart.getTime() >= weekEnd.getTime()
    ) {
      return [];
    }

    const clippedStart = new Date(Math.max(scheduleStart.getTime(), weekStart.getTime()));
    const clippedEnd = new Date(Math.min(scheduleEnd.getTime(), weekEnd.getTime()));
    const segments: TeacherScheduleEntry[] = [];

    let segmentCursor = startOfLocalDay(clippedStart);
    while (segmentCursor.getTime() < clippedEnd.getTime()) {
      const dayOfWeek = toWeekdayKeyFromDate(segmentCursor);
      const dayStart = new Date(segmentCursor);
      const dayEnd = addDays(dayStart, 1);
      const segmentStart = new Date(Math.max(clippedStart.getTime(), dayStart.getTime()));
      const segmentEnd = new Date(Math.min(clippedEnd.getTime(), dayEnd.getTime()));

      if (dayOfWeek !== null && segmentEnd.getTime() > segmentStart.getTime()) {
        const startMinutes = getMinutesSinceDayStart(segmentStart);
        const endMinutes = getMinutesSinceDayStart(segmentEnd);
        segments.push(
          createEntry({
            kind: 'one_off',
            id: `${schedule.id}:${dayOfWeek}:${startMinutes}`,
            schedule,
            classroomNameMap,
            groupNameMap,
            dayOfWeek,
            startAt: segmentStart,
            endAt: segmentEnd,
            startMinutes,
            endMinutes:
              endMinutes === 0 && segmentEnd.getTime() === dayEnd.getTime() ? 24 * 60 : endMinutes,
          })
        );
      }

      segmentCursor = dayEnd;
    }

    return segments;
  });
}

function createEntry(params: {
  kind: TeacherScheduleEntryKind;
  id: string;
  schedule: ScheduleWithPermissions | OneOffScheduleWithPermissions;
  classroomNameMap: ReadonlyMap<string, string>;
  groupNameMap: ReadonlyMap<string, string>;
  dayOfWeek: WeekdayKey;
  startAt: Date;
  endAt: Date;
  startMinutes: number;
  endMinutes: number;
}): TeacherScheduleEntry {
  const classroomName =
    params.classroomNameMap.get(params.schedule.classroomId) ?? params.schedule.classroomId;
  const groupName =
    params.groupNameMap.get(params.schedule.groupId) ??
    params.schedule.groupDisplayName ??
    params.schedule.groupId;

  return {
    kind: params.kind,
    id: params.id,
    schedule: params.schedule,
    dayOfWeek: params.dayOfWeek,
    startAt: params.startAt,
    endAt: params.endAt,
    startTime: formatMinutes(params.startMinutes),
    endTime: formatMinutes(params.endMinutes),
    startMinutes: params.startMinutes,
    endMinutes: params.endMinutes,
    classroomId: params.schedule.classroomId,
    colorKey: params.schedule.classroomId,
    label: `${groupName} - ${classroomName}`,
    groupName,
    classroomName,
    canEdit: params.schedule.canEdit,
    laneIndex: 0,
    laneCount: 1,
  };
}

function groupEntriesForLayout(
  entries: readonly TeacherScheduleEntry[]
): Map<WeekdayKey, TeacherScheduleEntry[]> {
  const map = groupTeacherScheduleEntriesByDay(entries);
  for (const [dayOfWeek, list] of map.entries()) {
    map.set(dayOfWeek, list.slice().sort(compareEntries));
  }
  return map;
}

function assignLanes(entries: readonly TeacherScheduleEntry[]): Map<string, LaneAssignment> {
  const assignments = new Map<string, LaneAssignment>();
  const sorted = entries.slice().sort(compareEntries);
  let cluster: TeacherScheduleEntry[] = [];
  let clusterEnd = -1;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const clusterAssignments = assignClusterLanes(cluster);
    for (const [id, assignment] of clusterAssignments.entries()) {
      assignments.set(id, assignment);
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const entry of sorted) {
    if (cluster.length === 0) {
      cluster = [entry];
      clusterEnd = entry.endAt.getTime();
      continue;
    }

    if (entry.startAt.getTime() >= clusterEnd) {
      flushCluster();
      cluster = [entry];
      clusterEnd = entry.endAt.getTime();
      continue;
    }

    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.endAt.getTime());
  }

  flushCluster();
  return assignments;
}

function assignClusterLanes(entries: readonly TeacherScheduleEntry[]): Map<string, LaneAssignment> {
  const laneAssignments = new Map<string, LaneAssignment>();
  const laneEnds: number[] = [];
  const sorted = entries.slice().sort(compareEntries);
  const laneCount = getMaxOverlapCount(sorted);

  for (const entry of sorted) {
    const entryStart = entry.startAt.getTime();
    let laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= entryStart);
    if (laneIndex === -1) {
      laneIndex = laneEnds.length;
      laneEnds.push(entry.endAt.getTime());
    } else {
      laneEnds[laneIndex] = entry.endAt.getTime();
    }

    laneAssignments.set(entry.id, {
      laneIndex,
      laneCount,
    });
  }

  return laneAssignments;
}

function getMaxOverlapCount(entries: readonly TeacherScheduleEntry[]): number {
  const events = entries.flatMap((entry) => [
    { time: entry.startAt.getTime(), delta: 1 },
    { time: entry.endAt.getTime(), delta: -1 },
  ]);
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);

  let current = 0;
  let max = 1;
  for (const event of events) {
    current += event.delta;
    max = Math.max(max, current);
  }
  return max;
}

function compareEntries(a: TeacherScheduleEntry, b: TeacherScheduleEntry): number {
  return (
    a.startAt.getTime() - b.startAt.getTime() ||
    a.endAt.getTime() - b.endAt.getTime() ||
    a.label.localeCompare(b.label) ||
    a.id.localeCompare(b.id)
  );
}

function addDaysAndMinutes(date: Date, days: number, minutes: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(0, 0, 0, 0);
  next.setMinutes(minutes, 0, 0);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getMinutesSinceDayStart(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatMinutes(totalMinutes: number): string {
  if (totalMinutes === 24 * 60) {
    return '24:00';
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function toWeekdayKey(dayOfWeek: number): WeekdayKey | null {
  return dayOfWeek >= 1 && dayOfWeek <= 5 ? (dayOfWeek as WeekdayKey) : null;
}

function toWeekdayKeyFromDate(date: Date): WeekdayKey | null {
  const day = date.getDay();
  return day >= 1 && day <= 5 ? (day as WeekdayKey) : null;
}
