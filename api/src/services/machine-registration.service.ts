import { config } from '../config.js';
import * as classroomStorage from '../lib/classroom-storage.js';
import { verifyEnrollmentToken } from '../lib/enrollment-token.js';
import {
  buildWhitelistUrl,
  generateMachineToken,
  hashMachineToken,
} from '../lib/machine-download-token.js';
import * as setupStorage from '../lib/setup-storage.js';

export type MachineRegistrationServiceError =
  | { code: 'UNAUTHORIZED'; message: string }
  | { code: 'FORBIDDEN'; message: string }
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'BAD_REQUEST'; message: string };

export type MachineRegistrationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: MachineRegistrationServiceError };

export interface RegisterMachineWithTokenInput {
  authorizationHeader?: string | undefined;
  classroomId?: string | undefined;
  classroomName?: string | undefined;
  hostname?: string | undefined;
  version?: string | undefined;
}

export interface RegisterMachineWithTokenOutput {
  classroomId: string;
  classroomName: string;
  machineHostname: string;
  reportedHostname: string;
  whitelistUrl: string;
}

export interface RotateMachineDownloadTokenOutput {
  whitelistUrl: string;
}

function getPublicUrl(): string {
  return config.publicUrl ?? `http://${config.host}:${String(config.port)}`;
}

async function issueMachineDownloadToken(machineId: string): Promise<string> {
  const token = generateMachineToken();
  const tokenHash = hashMachineToken(token);
  await classroomStorage.setMachineDownloadTokenHash(machineId, tokenHash);
  return buildWhitelistUrl(getPublicUrl(), token);
}

export async function registerMachineWithToken(
  input: RegisterMachineWithTokenInput
): Promise<MachineRegistrationResult<RegisterMachineWithTokenOutput>> {
  const authHeader = input.authorizationHeader;
  if (authHeader?.startsWith('Bearer ') !== true) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Authorization header required' },
    };
  }

  const hostname = input.hostname;
  if (!hostname) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'hostname is required' },
    };
  }

  const providedToken = authHeader.slice(7);
  const enrollmentPayload = verifyEnrollmentToken(providedToken);

  const classroomLookup = await (async (): Promise<
    | { ok: true; classroom: { id: string; name: string } }
    | { ok: false; error: MachineRegistrationServiceError }
  > => {
    if (enrollmentPayload) {
      if (input.classroomId && input.classroomId !== enrollmentPayload.classroomId) {
        return {
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Enrollment token does not match classroom' },
        };
      }

      const classroom = await classroomStorage.getClassroomById(enrollmentPayload.classroomId);
      if (!classroom) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Classroom not found' } };
      }

      return { ok: true, classroom };
    }

    const isValid = await setupStorage.validateRegistrationToken(providedToken);
    if (!isValid) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Invalid registration token' } };
    }

    if (!input.classroomName) {
      return { ok: false, error: { code: 'BAD_REQUEST', message: 'classroomName is required' } };
    }

    const classroom = await classroomStorage.getClassroomByName(input.classroomName);
    if (!classroom) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Classroom "${input.classroomName}" not found`,
        },
      };
    }

    return { ok: true, classroom };
  })();

  if (!classroomLookup.ok) {
    return classroomLookup;
  }

  const { classroom } = classroomLookup;
  const machineHostname = classroomStorage.buildMachineKey(classroom.id, hostname);
  const machine = await classroomStorage.registerMachine({
    hostname: machineHostname,
    reportedHostname: hostname,
    classroomId: classroom.id,
    ...(input.version ? { version: input.version } : {}),
  });

  const whitelistUrl = await issueMachineDownloadToken(machine.id);

  return {
    ok: true,
    data: {
      classroomId: classroom.id,
      classroomName: classroom.name,
      machineHostname: machine.hostname,
      reportedHostname: machine.reportedHostname ?? hostname,
      whitelistUrl,
    },
  };
}

export async function rotateMachineDownloadToken(
  machineId: string
): Promise<MachineRegistrationResult<RotateMachineDownloadTokenOutput>> {
  return {
    ok: true,
    data: {
      whitelistUrl: await issueMachineDownloadToken(machineId),
    },
  };
}

export default {
  registerMachineWithToken,
  rotateMachineDownloadToken,
};
