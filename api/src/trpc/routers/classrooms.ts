import { z } from 'zod';
import {
  router,
  publicProcedure,
  adminProcedure,
  teacherProcedure,
  requireEnrollmentTokenAccess,
} from '../trpc.js';
import { TRPCError } from '@trpc/server';
import * as classroomStorage from '../../lib/classroom-storage.js';
import ClassroomService from '../../services/classroom.service.js';
import type {
  ClassroomServiceError,
  CreateClassroomInput,
  UpdateClassroomData,
} from '../../services/classroom.service.js';

function throwClassroomServiceError(error: ClassroomServiceError): never {
  throw new TRPCError({ code: error.code, message: error.message });
}

const CreateClassroomInputSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().optional(),
  defaultGroupId: z.string().optional(),
});

export const classroomsRouter = router({
  list: teacherProcedure.query(async ({ ctx }) => {
    return await ClassroomService.listClassrooms(ctx.user);
  }),

  get: teacherProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const result = await ClassroomService.getClassroom(input.id, ctx.user);
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  create: adminProcedure.input(CreateClassroomInputSchema).mutation(async ({ input }) => {
    const createData: CreateClassroomInput = {
      name: input.name,
      displayName: input.displayName ?? input.name,
      ...(input.defaultGroupId !== undefined ? { defaultGroupId: input.defaultGroupId } : {}),
    };
    const result = await ClassroomService.createClassroom(createData);

    if (!result.ok) {
      throwClassroomServiceError(result.error);
    }

    return result.data;
  }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        displayName: z.string().optional(),
        defaultGroupId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const updates: UpdateClassroomData = {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(typeof input.defaultGroupId === 'string'
          ? { defaultGroupId: input.defaultGroupId }
          : {}),
      };
      const result = await ClassroomService.updateClassroom(input.id, updates);

      if (!result.ok) {
        throwClassroomServiceError(result.error);
      }

      return result.data;
    }),

  setActiveGroup: teacherProcedure
    .input(
      z.object({
        id: z.string(),
        groupId: z.string().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await ClassroomService.setClassroomActiveGroup(ctx.user, input);
      if (!result.ok) throwClassroomServiceError(result.error);

      return result.data;
    }),

  createExemption: teacherProcedure
    .input(
      z.object({
        machineId: z.string().min(1),
        classroomId: z.string().min(1),
        scheduleId: z.uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await ClassroomService.createExemptionForClassroom(ctx.user, {
        ...input,
        createdBy: ctx.user.sub,
      });

      if (!result.ok) {
        throwClassroomServiceError(result.error);
      }

      return result.data;
    }),

  deleteExemption: teacherProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const result = await ClassroomService.deleteExemptionForClassroom(ctx.user, input.id);
      if (!result.ok) {
        throwClassroomServiceError(result.error);
      }

      return result.data;
    }),

  listExemptions: teacherProcedure
    .input(z.object({ classroomId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const result = await ClassroomService.listExemptionsForClassroom(ctx.user, input.classroomId);
      if (!result.ok) {
        throwClassroomServiceError(result.error);
      }

      return result.data;
    }),

  delete: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const result = await ClassroomService.deleteClassroom(input.id);
    if (!result.ok) {
      throwClassroomServiceError(result.error);
    }
    return result.data;
  }),

  stats: adminProcedure.query(async () => {
    return await classroomStorage.getStats();
  }),

  // Shared Secret / Machine endpoints
  registerMachine: publicProcedure
    .input(
      z.object({
        hostname: z.string().min(1),
        classroomId: z.string().optional(),
        classroomName: z.string().optional(),
        version: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const enrollment = await requireEnrollmentTokenAccess(ctx.req);

      if (input.classroomId && input.classroomId !== enrollment.classroomId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Enrollment token is not valid for this classroom',
        });
      }

      if (input.classroomName && input.classroomName !== enrollment.classroomName) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Enrollment token is not valid for this classroom',
        });
      }

      const result = await ClassroomService.registerMachine({
        ...input,
        classroomId: enrollment.classroomId,
        classroomName: enrollment.classroomName,
      });
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }

      const roomResult = await ClassroomService.getClassroom(result.data.classroomId);
      return {
        machine: result.data,
        classroom: roomResult.ok ? roomResult.data : null,
      };
    }),

  deleteMachine: adminProcedure
    .input(z.object({ hostname: z.string() }))
    .mutation(async ({ input }) => {
      if (!(await classroomStorage.deleteMachine(input.hostname))) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Machine not found' });
      }
      return { success: true };
    }),

  listMachines: adminProcedure
    .input(z.object({ classroomId: z.string().optional() }))
    .query(async ({ input }) => {
      return await ClassroomService.listMachines(input.classroomId);
    }),

  rotateMachineToken: adminProcedure
    .input(z.object({ machineId: z.string() }))
    .mutation(async ({ input }) => {
      const result = await ClassroomService.rotateMachineToken(input.machineId);
      if (!result.ok) {
        throwClassroomServiceError(result.error);
      }

      return { success: true, whitelistUrl: result.data.whitelistUrl };
    }),
});
