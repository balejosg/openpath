import { getErrorMessage } from '@openpath/shared';

import { config } from '../config.js';
import { buildLinuxEnrollmentScript } from '../lib/enrollment-script.js';
import {
  normalizeLinuxAgentAptSuite,
  resolveEnrollmentLinuxAgentVersionPin,
} from '../lib/server-assets.js';
import type {
  EnrollmentScriptOutput,
  EnrollmentServiceResult,
} from './enrollment-service-shared.js';
import { buildWindowsEnrollmentScript } from './enrollment-service-shared.js';
import { resolveEnrollmentContext } from './enrollment-access.service.js';

export async function buildLinuxEnrollmentBootstrap(input: {
  authorizationHeader?: string | undefined;
  classroomId: string;
  publicUrl: string;
}): Promise<EnrollmentServiceResult<EnrollmentScriptOutput>> {
  const context = await resolveEnrollmentContext({
    authorizationHeader: input.authorizationHeader,
    classroomId: input.classroomId,
  });
  if (!context.ok) {
    return context;
  }

  const aptRepoUrl = config.aptRepoUrl;
  if (!aptRepoUrl) {
    return {
      ok: false,
      error: { code: 'MISCONFIGURED', message: 'APT repo URL not configured' },
    };
  }

  const configuredLinuxAgentVersion = process.env.OPENPATH_LINUX_AGENT_VERSION?.trim() ?? '';
  let linuxAgentAptSuite = 'stable';
  let effectiveLinuxAgentVersion = '';
  try {
    linuxAgentAptSuite = normalizeLinuxAgentAptSuite(process.env.OPENPATH_LINUX_AGENT_APT_SUITE);
    effectiveLinuxAgentVersion = await resolveEnrollmentLinuxAgentVersionPin(
      aptRepoUrl,
      configuredLinuxAgentVersion,
      linuxAgentAptSuite
    );
  } catch (error) {
    return {
      ok: false,
      error: { code: 'MISCONFIGURED', message: getErrorMessage(error) },
    };
  }

  return {
    ok: true,
    data: {
      script: buildLinuxEnrollmentScript({
        publicUrl: input.publicUrl,
        classroomId: context.data.classroom.id,
        classroomName: context.data.classroom.name,
        enrollmentToken: context.data.enrollmentToken,
        aptRepoUrl,
        linuxAgentVersion: effectiveLinuxAgentVersion,
        linuxAgentAptSuite,
      }),
    },
  };
}

export async function buildWindowsEnrollmentBootstrap(input: {
  authorizationHeader?: string | undefined;
  classroomId: string;
  publicUrl: string;
}): Promise<EnrollmentServiceResult<EnrollmentScriptOutput>> {
  const context = await resolveEnrollmentContext({
    authorizationHeader: input.authorizationHeader,
    classroomId: input.classroomId,
  });
  if (!context.ok) {
    return context;
  }

  return {
    ok: true,
    data: {
      script: buildWindowsEnrollmentScript({
        publicUrl: input.publicUrl,
        classroomId: context.data.classroom.id,
        enrollmentToken: context.data.enrollmentToken,
      }),
    },
  };
}

export const EnrollmentBootstrapService = {
  buildLinuxEnrollmentBootstrap,
  buildWindowsEnrollmentBootstrap,
};

export default EnrollmentBootstrapService;
