import { z } from 'zod';
import {
  router,
  publicProcedure,
  protectedProcedure,
  teacherProcedure,
  adminProcedure,
} from '../trpc.js';
import { RequestStatusSchema, CreateRequestDTOSchema } from '../../types/index.js';
import { TRPCError } from '@trpc/server';
import { CreateRequestData } from '../../types/storage.js';
import * as storage from '../../lib/storage.js';
import * as groupsStorage from '../../lib/groups-storage.js';
import { stripUndefined } from '../../lib/utils.js';
import { RequestService } from '../../services/index.js';

export const requestsRouter = router({
  /**
   * Create a new domain access request.
   * Public endpoint, requires valid email.
   */
  create: publicProcedure.input(CreateRequestDTOSchema).mutation(async ({ input }) => {
    const result = await RequestService.createRequest(
      stripUndefined({
        domain: input.domain.toLowerCase(),
        reason: input.reason ?? 'No reason provided',
        requesterEmail: input.requesterEmail,
        groupId: input.groupId,
        priority: input.priority,
        source: input.source,
        machineHostname: input.machineHostname,
        originHost: input.originHost,
        originPage: input.originPage,
        clientVersion: input.clientVersion,
        errorType: input.errorType,
      }) as CreateRequestData
    );

    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  /**
   * Get request status by ID.
   * Public endpoint for polling status.
   */
  getStatus: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const request = await storage.getRequestById(input.id);
    if (!request) throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
    return { id: request.id, domain: request.domain, status: request.status };
  }),

  /**
   * List all requests.
   * Protected endpoint.
   */
  list: protectedProcedure
    .input(z.object({ status: RequestStatusSchema.optional() }))
    .query(async ({ input, ctx }) => {
      return await RequestService.listRequests(input.status ?? null, ctx.user);
    }),

  /**
   * Get full request details by ID.
   * Protected endpoint. Enforces group access control.
   */
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const result = await RequestService.getRequest(input.id, ctx.user);
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  /**
   * Approve a request.
   * Teacher/Admin endpoint.
   */
  approve: teacherProcedure
    .input(z.object({ id: z.string(), groupId: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await RequestService.approveRequest(input.id, input.groupId, ctx.user);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  // Teacher+: Reject
  reject: teacherProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await RequestService.rejectRequest(input.id, input.reason, ctx.user);
      if (!result.ok) {
        throw new TRPCError({ code: result.error.code, message: result.error.message });
      }
      return result.data;
    }),

  // Admin: Delete
  delete: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const result = await RequestService.deleteRequest(input.id);
    if (!result.ok) {
      throw new TRPCError({ code: result.error.code, message: result.error.message });
    }
    return result.data;
  }),

  /**
   * Get request statistics.
   * Admin endpoint.
   */
  stats: adminProcedure.query(async () => {
    return await storage.getStats();
  }),

  // Protected: List groups
  listGroups: protectedProcedure.query(async ({ ctx }) => {
    const allGroups = await groupsStorage.getAllGroups();
    const userGroups = RequestService.getApprovalGroupsForUser(ctx.user);
    const filteredGroups =
      userGroups === 'all'
        ? allGroups
        : allGroups.filter((g) => userGroups.includes(g.name) || userGroups.includes(g.id));
    return filteredGroups.map((g) => ({ id: g.id, name: g.name, path: g.id }));
  }),

  // Admin: List blocked domains for a group
  listBlocked: adminProcedure.input(z.object({ groupId: z.string() })).query(async ({ input }) => {
    return await groupsStorage.getBlockedSubdomains(input.groupId);
  }),

  // Protected: Check if domain is blocked in a group
  check: protectedProcedure
    .input(z.object({ domain: z.string(), groupId: z.string() }))
    .mutation(async ({ input }) => {
      return await groupsStorage.isDomainBlocked(input.groupId, input.domain);
    }),
});
