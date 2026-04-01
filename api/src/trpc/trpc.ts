import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';
import * as auth from '../lib/auth.js';
import * as classroomStorage from '../lib/classroom-storage.js';
import { verifyEnrollmentToken } from '../lib/enrollment-token.js';
import { hashMachineToken } from '../lib/machine-download-token.js';
import { logger } from '../lib/logger.js';

function getRequestId(ctx?: Context): string | undefined {
  const raw = ctx?.req.headers['x-request-id'];
  return Array.isArray(raw) ? raw[0] : raw;
}

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, ctx }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        requestId: getRequestId(ctx),
      },
    };
  },
});

type AuthenticatedMachine = NonNullable<
  Awaited<ReturnType<typeof classroomStorage.getMachineByDownloadTokenHash>>
>;

export const router = t.router;
export const publicProcedure = t.procedure;

// Authenticated procedure middleware
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Admin-only procedure middleware
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!auth.isAdminToken(ctx.user)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

// Teacher/Admin procedure middleware
export const teacherProcedure = protectedProcedure.use(({ ctx, next }) => {
  const roles = ctx.user.roles.map((r) => r.role);
  if (!roles.includes('admin') && !roles.includes('teacher')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Teacher access required' });
  }
  return next({ ctx });
});

function getBearerToken(req: Context['req'], missingMessage: string): string {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: missingMessage });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: missingMessage });
  }

  return token;
}

export async function requireEnrollmentTokenAccess(
  req: Context['req']
): Promise<{ classroomId: string; classroomName: string }> {
  const token = getBearerToken(req, 'Enrollment token required');
  const payload = verifyEnrollmentToken(token);
  if (!payload) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid enrollment token' });
  }

  const classroom = await classroomStorage.getClassroomById(payload.classroomId);
  if (!classroom) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Classroom not found' });
  }

  return {
    classroomId: classroom.id,
    classroomName: classroom.name,
  };
}

export async function requireMachineTokenAccess(
  req: Context['req']
): Promise<AuthenticatedMachine> {
  const token = getBearerToken(req, 'Machine token required');
  const machine = await classroomStorage.getMachineByDownloadTokenHash(hashMachineToken(token));
  if (!machine) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid machine token' });
  }

  return machine;
}

export function machineMatchesHostname(
  machine: Pick<AuthenticatedMachine, 'hostname' | 'reportedHostname'>,
  hostname: string
): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    machine.hostname.trim().toLowerCase() === normalized ||
    machine.reportedHostname?.trim().toLowerCase() === normalized
  );
}

// Shared secret procedure (for machines)
export const sharedSecretProcedure = t.procedure.use(({ ctx, next }) => {
  const secret = process.env.SHARED_SECRET;
  if (secret !== undefined && secret !== '') {
    const authHeader = ctx.req.headers.authorization;
    if (authHeader !== `Bearer ${secret}`) {
      logger.warn('Failed shared secret authentication attempt', {
        path: ctx.req.path,
        ip: ctx.req.ip,
      });
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid or missing shared secret' });
    }
  }
  return next({ ctx });
});

export function logTrpcError(params: {
  path: string | undefined;
  ctx: Context | undefined;
  error: Error;
}): void {
  logger.error('tRPC request failed', {
    requestId: getRequestId(params.ctx),
    path: params.path,
    error: params.error.message,
  });
}
