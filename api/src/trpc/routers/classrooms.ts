import { z } from 'zod';
import {
  router,
  publicProcedure,
  adminProcedure,
  teacherProcedure,
  requireEnrollmentTokenAccess,
} from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { CreateClassroomDTOSchema, getErrorMessage } from '../../types/index.js';
import type { CreateClassroomData, UpdateClassroomData } from '../../types/storage.js';
import * as classroomStorage from '../../lib/classroom-storage.js';
import * as auth from '../../lib/auth.js';
import { stripUndefined } from '../../lib/utils.js';
import { logger } from '../../lib/logger.js';
import { ClassroomService } from '../../services/index.js';
import {
  generateMachineToken,
  hashMachineToken,
  buildWhitelistUrl,
} from '../../lib/machine-download-token.js';
import { config } from '../../config.js';
import { emitClassroomChanged } from '../../lib/rule-events.js';
import {
  MachineExemptionError,
  createMachineExemption,
  deleteMachineExemption,
  getMachineExemptionById,
  getActiveMachineExemptionsByClassroom,
} from '../../lib/exemption-storage.js';

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

  create: adminProcedure
    .input(
      CreateClassroomDTOSchema.extend({
        defaultGroupId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const createData = stripUndefined({
          name: input.name,
          displayName: input.displayName,
          defaultGroupId: input.defaultGroupId,
        });
        return await classroomStorage.createClassroom(
          createData as CreateClassroomData & { defaultGroupId?: string }
        );
      } catch (error) {
        logger.error('classrooms.create error', { error: getErrorMessage(error), input });
        if (error instanceof Error && error.message.includes('already exists')) {
          throw new TRPCError({ code: 'CONFLICT', message: error.message });
        }
        throw error;
      }
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
      const updateData: UpdateClassroomData = stripUndefined({
        displayName: input.displayName,
        defaultGroupId: input.defaultGroupId ?? undefined,
      });
      const updated = await classroomStorage.updateClassroom(input.id, updateData);
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Classroom not found' });

      if (input.defaultGroupId !== undefined) {
        emitClassroomChanged(updated.id);
      }

      return updated;
    }),

  setActiveGroup: teacherProcedure
    .input(
      z.object({
        id: z.string(),
        groupId: z.string().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const access = await ClassroomService.ensureUserCanAccessClassroom(ctx.user, input.id);
      if (!access.ok) {
        throw new TRPCError({ code: access.error.code, message: access.error.message });
      }

      if (
        input.groupId !== null &&
        !auth.isAdminToken(ctx.user) &&
        !auth.canApproveGroup(ctx.user, input.groupId)
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only set groups within your assigned scope',
        });
      }

      const updated = await classroomStorage.setActiveGroup(input.id, input.groupId);
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Classroom not found' });

      emitClassroomChanged(updated.id);

      const result = await ClassroomService.getClassroom(input.id, ctx.user);
      if (!result.ok)
        throw new TRPCError({ code: result.error.code, message: result.error.message });

      return {
        classroom: result.data,
        currentGroupId: result.data.currentGroupId,
      };
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
      const access = await ClassroomService.ensureUserCanAccessClassroom(
        ctx.user,
        input.classroomId
      );
      if (!access.ok) {
        throw new TRPCError({ code: access.error.code, message: access.error.message });
      }

      try {
        const created = await createMachineExemption({
          machineId: input.machineId,
          classroomId: input.classroomId,
          scheduleId: input.scheduleId,
          createdBy: ctx.user.sub,
        });

        emitClassroomChanged(input.classroomId);

        return {
          id: created.id,
          machineId: created.machineId,
          classroomId: created.classroomId,
          scheduleId: created.scheduleId,
          createdBy: created.createdBy ?? null,
          createdAt: created.createdAt ? created.createdAt.toISOString() : null,
          expiresAt: created.expiresAt.toISOString(),
        };
      } catch (error: unknown) {
        if (error instanceof MachineExemptionError) {
          throw new TRPCError({ code: error.code, message: error.message });
        }
        throw error;
      }
    }),

  deleteExemption: teacherProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const existing = await getMachineExemptionById(input.id);
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Exemption not found' });
      }

      const access = await ClassroomService.ensureUserCanAccessClassroom(
        ctx.user,
        existing.classroomId
      );
      if (!access.ok) {
        throw new TRPCError({ code: access.error.code, message: access.error.message });
      }

      const deleted = await deleteMachineExemption(input.id);
      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Exemption not found' });
      }

      emitClassroomChanged(deleted.classroomId);
      return { success: true };
    }),

  listExemptions: teacherProcedure
    .input(z.object({ classroomId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const access = await ClassroomService.ensureUserCanAccessClassroom(
        ctx.user,
        input.classroomId
      );
      if (!access.ok) {
        throw new TRPCError({ code: access.error.code, message: access.error.message });
      }

      const rows = await getActiveMachineExemptionsByClassroom(input.classroomId, new Date());
      return {
        classroomId: input.classroomId,
        exemptions: rows.map((e) => ({
          id: e.id,
          machineId: e.machineId,
          machineHostname: e.machineHostname,
          classroomId: e.classroomId,
          scheduleId: e.scheduleId,
          createdBy: e.createdBy,
          createdAt: e.createdAt ? e.createdAt.toISOString() : null,
          expiresAt: e.expiresAt.toISOString(),
        })),
      };
    }),

  delete: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    if (!(await classroomStorage.deleteClassroom(input.id))) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Classroom not found' });
    }
    return { success: true };
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
      const allMachines = await classroomStorage.getAllMachines(input.classroomId);
      return allMachines.map((m) => ({
        id: m.id,
        hostname: m.hostname,
        classroomId: m.classroomId,
        version: m.version,
        lastSeen: m.lastSeen?.toISOString() ?? null,
        hasDownloadToken: m.downloadTokenHash !== null,
        downloadTokenLastRotatedAt: m.downloadTokenLastRotatedAt?.toISOString() ?? null,
      }));
    }),

  rotateMachineToken: adminProcedure
    .input(z.object({ machineId: z.string() }))
    .mutation(async ({ input }) => {
      const machine = await classroomStorage.getMachineById(input.machineId);
      if (!machine) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Machine not found' });
      }

      const token = generateMachineToken();
      const tokenHash = hashMachineToken(token);
      await classroomStorage.setMachineDownloadTokenHash(input.machineId, tokenHash);

      const publicUrl = config.publicUrl ?? `http://${config.host}:${String(config.port)}`;
      const whitelistUrl = buildWhitelistUrl(publicUrl, token);

      logger.info('Machine download token rotated via dashboard', {
        machineId: input.machineId,
        hostname: machine.hostname,
      });

      return { success: true, whitelistUrl };
    }),
});
