import { z } from 'zod';
import { router, adminProcedure, sharedSecretProcedure, teacherProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { CreateClassroomDTOSchema, getErrorMessage } from '../../types/index.js';
import type { CreateClassroomData, UpdateClassroomData } from '../../types/storage.js';
import * as classroomStorage from '../../lib/classroom-storage.js';
import { stripUndefined } from '../../lib/utils.js';
import { logger } from '../../lib/logger.js';
import { ClassroomService } from '../../services/index.js';
import {
  generateMachineToken,
  hashMachineToken,
  buildWhitelistUrl,
} from '../../lib/machine-download-token.js';
import { config } from '../../config.js';

export const classroomsRouter = router({
  list: teacherProcedure.query(async () => {
    return await ClassroomService.listClassrooms();
  }),

  get: teacherProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const result = await ClassroomService.getClassroom(input.id);
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
      return updated;
    }),

  setActiveGroup: teacherProcedure
    .input(
      z.object({
        id: z.string(),
        groupId: z.string().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const updated = await classroomStorage.setActiveGroup(input.id, input.groupId);
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Classroom not found' });

      const result = await ClassroomService.getClassroom(input.id);
      if (!result.ok)
        throw new TRPCError({ code: result.error.code, message: result.error.message });

      return {
        classroom: result.data,
        currentGroupId: result.data.currentGroupId,
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
  registerMachine: sharedSecretProcedure
    .input(
      z.object({
        hostname: z.string().min(1),
        classroomId: z.string().optional(),
        classroomName: z.string().optional(),
        version: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await ClassroomService.registerMachine(input);
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
