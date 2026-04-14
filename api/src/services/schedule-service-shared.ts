export interface Schedule {
  id: string;
  classroomId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  groupId: string;
  teacherId: string;
  recurrence?: string;
  createdAt: string;
  updatedAt?: string | undefined;
}

export interface OneOffSchedule {
  id: string;
  classroomId: string;
  startAt: string;
  endAt: string;
  groupId: string;
  teacherId: string;
  recurrence: 'one_off';
  createdAt: string;
  updatedAt?: string | undefined;
}

export type ScheduleServiceError =
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'FORBIDDEN'; message: string }
  | { code: 'CONFLICT'; message: string }
  | { code: 'BAD_REQUEST'; message: string };

export type ScheduleResult<T> = { ok: true; data: T } | { ok: false; error: ScheduleServiceError };

export interface ScheduleWithPermissions extends Schedule {
  isMine: boolean;
  canEdit: boolean;
}

export interface OneOffScheduleWithPermissions extends OneOffSchedule {
  isMine: boolean;
  canEdit: boolean;
}

export interface ClassroomScheduleResult {
  classroom: {
    id: string;
    name: string;
    displayName: string;
  };
  schedules: ScheduleWithPermissions[];
  oneOffSchedules: OneOffScheduleWithPermissions[];
}

export interface StorageSchedule {
  id: string;
  classroomId: string;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  startAt: Date | null;
  endAt: Date | null;
  groupId: string;
  teacherId: string;
  recurrence: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

function normalizeTime(time: string): string {
  const parts = time.split(':');
  const hours = parts[0];
  const minutes = parts[1];
  if (hours !== undefined && minutes !== undefined) {
    return `${hours}:${minutes}`;
  }
  return time;
}

export function mapToWeeklySchedule(s: StorageSchedule): Schedule {
  if (s.dayOfWeek === null || s.startTime === null || s.endTime === null) {
    throw new Error('Weekly schedule is missing required fields');
  }

  return {
    id: s.id,
    classroomId: s.classroomId,
    dayOfWeek: s.dayOfWeek,
    startTime: normalizeTime(s.startTime),
    endTime: normalizeTime(s.endTime),
    groupId: s.groupId,
    teacherId: s.teacherId,
    recurrence: s.recurrence ?? 'weekly',
    createdAt: s.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: s.updatedAt?.toISOString() ?? undefined,
  };
}

export function mapToOneOffSchedule(s: StorageSchedule): OneOffSchedule {
  if (s.startAt === null || s.endAt === null) {
    throw new Error('One-off schedule is missing required fields');
  }

  return {
    id: s.id,
    classroomId: s.classroomId,
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    groupId: s.groupId,
    teacherId: s.teacherId,
    recurrence: 'one_off',
    createdAt: s.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: s.updatedAt?.toISOString() ?? undefined,
  };
}
