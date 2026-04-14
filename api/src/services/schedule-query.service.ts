import * as scheduleStorage from '../lib/schedule-storage.js';
import * as auth from '../lib/auth.js';
import type { Schedule, OneOffSchedule, JWTPayload } from '../types/index.js';
import { ensureUserCanAccessClassroom } from './classroom.service.js';
import type { ClassroomScheduleResult, ScheduleResult } from './schedule-service-shared.js';
import { mapToOneOffSchedule, mapToWeeklySchedule } from './schedule-service-shared.js';

export async function getSchedulesByClassroom(
  classroomId: string,
  user: JWTPayload
): Promise<ScheduleResult<ClassroomScheduleResult>> {
  const access = await ensureUserCanAccessClassroom(user, classroomId);
  if (!access.ok) {
    return access;
  }

  const schedules = await scheduleStorage.getSchedulesByClassroom(classroomId);
  const oneOffSchedules = await scheduleStorage.getOneOffSchedulesByClassroom(classroomId);
  const userId = user.sub;
  const isAdmin = auth.isAdminToken(user);

  return {
    ok: true,
    data: {
      classroom: {
        id: access.data.id,
        name: access.data.name,
        displayName: access.data.displayName,
      },
      schedules: schedules.map((s) => ({
        ...mapToWeeklySchedule(s),
        isMine: s.teacherId === userId,
        canEdit: s.teacherId === userId || isAdmin,
      })),
      oneOffSchedules: oneOffSchedules.map((s) => ({
        ...mapToOneOffSchedule(s),
        isMine: s.teacherId === userId,
        canEdit: s.teacherId === userId || isAdmin,
      })),
    },
  };
}

export async function getCurrentSchedule(
  classroomId: string
): Promise<Schedule | OneOffSchedule | null> {
  const schedule = await scheduleStorage.getCurrentSchedule(classroomId);
  if (!schedule) {
    return null;
  }

  if (schedule.recurrence === 'one_off') {
    return mapToOneOffSchedule(schedule);
  }

  return mapToWeeklySchedule(schedule);
}

export async function getCurrentScheduleForUser(
  classroomId: string,
  user: JWTPayload
): Promise<ScheduleResult<Schedule | OneOffSchedule | null>> {
  const access = await ensureUserCanAccessClassroom(user, classroomId);
  if (!access.ok) {
    return access;
  }

  return { ok: true, data: await getCurrentSchedule(classroomId) };
}

export async function getSchedulesByTeacher(teacherId: string): Promise<Schedule[]> {
  const schedules = await scheduleStorage.getSchedulesByTeacher(teacherId);
  return schedules.map(mapToWeeklySchedule);
}

export const ScheduleQueryService = {
  getSchedulesByClassroom,
  getCurrentSchedule,
  getCurrentScheduleForUser,
  getSchedulesByTeacher,
};

export default ScheduleQueryService;
