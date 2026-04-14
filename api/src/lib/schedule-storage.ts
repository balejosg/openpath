/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Schedule storage facade.
 */

import { logger } from './logger.js';

export * from './schedule-storage-shared.js';
export * from './schedule-storage-query.js';
export * from './schedule-storage-command.js';

import {
  timeToMinutes,
  timesOverlap,
  findConflict,
  findOneOffConflict,
} from './schedule-storage-shared.js';
import {
  getSchedulesByClassroom,
  getSchedulesByTeacher,
  getScheduleById,
  getOneOffSchedulesByClassroom,
  getOneOffSchedulesByTeacher,
  getCurrentSchedule,
  getCurrentSchedulesByClassroomIds,
  getClassroomIdsWithBoundaryAt,
} from './schedule-storage-query.js';
import {
  createSchedule,
  createOneOffSchedule,
  updateSchedule,
  updateOneOffSchedule,
  deleteSchedule,
  deleteSchedulesByClassroom,
} from './schedule-storage-command.js';

const ScheduleStorage = {
  getSchedulesByClassroom,
  getSchedulesByTeacher,
  getOneOffSchedulesByClassroom,
  getOneOffSchedulesByTeacher,
  getScheduleById,
  findConflict,
  findOneOffConflict,
  createSchedule,
  createOneOffSchedule,
  updateSchedule,
  updateOneOffSchedule,
  deleteSchedule,
  getCurrentSchedule,
  getCurrentSchedulesByClassroomIds,
  getClassroomIdsWithBoundaryAt,
  deleteSchedulesByClassroom,
  timeToMinutes,
  timesOverlap,
};

export default ScheduleStorage;

logger.debug('Schedule storage initialized');
