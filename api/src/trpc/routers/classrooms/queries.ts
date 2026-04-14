import ClassroomService from '../../../services/classroom.service.js';
import { adminProcedure, teacherProcedure } from '../../trpc.js';
import {
  classroomIdSchema,
  classroomListExemptionsSchema,
  listMachinesInputSchema,
} from './schemas.js';
import { throwClassroomServiceError } from './shared.js';

export const classroomQueryProcedures = {
  list: teacherProcedure.query(async ({ ctx }) => {
    return await ClassroomService.listClassrooms(ctx.user);
  }),

  get: teacherProcedure.input(classroomIdSchema).query(async ({ input, ctx }) => {
    const result = await ClassroomService.getClassroom(input.id, ctx.user);
    if (!result.ok) {
      throwClassroomServiceError(result.error);
    }
    return result.data;
  }),

  listExemptions: teacherProcedure
    .input(classroomListExemptionsSchema)
    .query(async ({ input, ctx }) => {
      const result = await ClassroomService.listExemptionsForClassroom(ctx.user, input.classroomId);
      if (!result.ok) {
        throwClassroomServiceError(result.error);
      }
      return result.data;
    }),

  stats: adminProcedure.query(async () => {
    return await ClassroomService.getStats();
  }),

  listMachines: adminProcedure.input(listMachinesInputSchema).query(async ({ input }) => {
    return await ClassroomService.listMachines(input.classroomId);
  }),
};
