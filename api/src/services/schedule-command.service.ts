import { createOneOffSchedule, createSchedule } from './schedule-command-create.service.js';
import {
  deleteSchedule,
  updateOneOffSchedule,
  updateSchedule,
} from './schedule-command-update.service.js';

export {
  createOneOffSchedule,
  createSchedule,
  deleteSchedule,
  updateOneOffSchedule,
  updateSchedule,
};

export const ScheduleCommandService = {
  createSchedule,
  createOneOffSchedule,
  updateSchedule,
  updateOneOffSchedule,
  deleteSchedule,
};

export default ScheduleCommandService;
