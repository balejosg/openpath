/**
 * ScheduleService - Business logic for schedule management
 */

import {
  createOneOffSchedule,
  createSchedule,
  deleteSchedule,
  updateOneOffSchedule,
  updateSchedule,
} from './schedule-command.service.js';
import {
  getSchedulesByClassroom,
  getCurrentSchedule,
  getCurrentScheduleForUser,
  getSchedulesByTeacher,
} from './schedule-query.service.js';
export type {
  ClassroomScheduleResult,
  OneOffScheduleWithPermissions,
  ScheduleResult,
  ScheduleServiceError,
  ScheduleWithPermissions,
} from './schedule-service-shared.js';

export const ScheduleService = {
  getSchedulesByClassroom,
  getSchedulesByTeacher,
  createSchedule,
  createOneOffSchedule,
  updateSchedule,
  updateOneOffSchedule,
  deleteSchedule,
  getCurrentSchedule,
  getCurrentScheduleForUser,
};

export default ScheduleService;
