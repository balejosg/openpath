import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { CreateScheduleDTOSchema } from '../../types/index.js';
import { ScheduleService } from '../../services/index.js';

export const schedulesRouter = router({
  getByClassroom: protectedProcedure
    .input(z.object({ classroomId: z.string() }))
    .query(async ({ input, ctx }) => {
      const result = await ScheduleService.getSchedulesByClassroom(input.classroomId, ctx.user);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  getMine: protectedProcedure.query(async ({ ctx }) => {
    // This logic remains in storage for now or we could move it to service
    // Actually, let's keep it simple and use service if possible
    const result = await ScheduleService.getSchedulesByTeacher(ctx.user.sub);
    return result;
  }),

  create: protectedProcedure
    .input(CreateScheduleDTOSchema.omit({ teacherId: true }))
    .mutation(async ({ input, ctx }) => {
      const result = await ScheduleService.createSchedule(
        {
          classroomId: input.classroomId,
          groupId: input.groupId,
          dayOfWeek: input.dayOfWeek,
          startTime: input.startTime,
          endTime: input.endTime,
        },
        ctx.user
      );

      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        dayOfWeek: z.number().min(1).max(5).optional(),
        startTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
          .optional(),
        endTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
          .optional(),
        groupId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await ScheduleService.updateSchedule(
        input.id,
        {
          dayOfWeek: input.dayOfWeek,
          startTime: input.startTime,
          endTime: input.endTime,
          groupId: input.groupId,
        },
        ctx.user
      );

      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const result = await ScheduleService.deleteSchedule(input.id, ctx.user);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  getCurrentForClassroom: protectedProcedure
    .input(z.object({ classroomId: z.string() }))
    .query(async ({ input }) => {
      const currentSchedule = await ScheduleService.getCurrentSchedule(input.classroomId);
      // We need activeGroupId here for the frontend
      // Let's get it from ClassroomService or just handle it here
      return {
        classroomId: input.classroomId,
        currentSchedule,
        // Fallback handled by service/router logic
      };
    }),
});
