import type { Request, Response } from 'express';

import * as classroomStorage from './classroom-storage.js';
import { hashMachineToken } from './machine-download-token.js';
import { getBearerTokenValue } from './server-request-http.js';

type MachineByToken = Awaited<ReturnType<typeof classroomStorage.getMachineByDownloadTokenHash>>;
export type AuthenticatedMachine = NonNullable<MachineByToken>;
type MachineHostnameRecord = Pick<AuthenticatedMachine, 'hostname' | 'reportedHostname'>;

export function validateMachineHostnameAccess(
  machine: MachineHostnameRecord,
  hostname: string
): { ok: true; requestedHostname: string } | { ok: false; requestedHostname: string } {
  const requestedHostname = hostname.trim().toLowerCase();
  if (!requestedHostname) {
    return { ok: false, requestedHostname };
  }

  return classroomStorage.machineHostnameMatches(machine, requestedHostname)
    ? { ok: true, requestedHostname }
    : { ok: false, requestedHostname };
}

export async function resolveMachineTokenAccess(
  machineToken: string
): Promise<AuthenticatedMachine | null> {
  const normalizedToken = machineToken.trim();
  if (!normalizedToken) {
    return null;
  }

  const tokenHash = hashMachineToken(normalizedToken);
  const machine = await classroomStorage.getMachineByDownloadTokenHash(tokenHash);
  return machine ?? null;
}

export async function resolveMachineTokenHostnameAccess(params: {
  machineToken: string;
  hostname: string;
}): Promise<
  | { ok: true; machine: AuthenticatedMachine; requestedHostname: string }
  | {
      ok: false;
      error: 'invalid-token' | 'hostname-mismatch';
      requestedHostname: string;
      machine?: AuthenticatedMachine;
    }
> {
  const requestedHostname = params.hostname.trim().toLowerCase();
  const machine = await resolveMachineTokenAccess(params.machineToken);
  if (!machine) {
    return { ok: false, error: 'invalid-token', requestedHostname };
  }

  const hostnameAccess = validateMachineHostnameAccess(machine, requestedHostname);
  if (!hostnameAccess.ok) {
    return { ok: false, error: 'hostname-mismatch', requestedHostname, machine };
  }

  return {
    ok: true,
    machine,
    requestedHostname: hostnameAccess.requestedHostname,
  };
}

export async function authenticateMachineToken(
  req: Request,
  res: Response
): Promise<AuthenticatedMachine | null> {
  const machineToken = getBearerTokenValue(req.headers.authorization);
  if (!machineToken) {
    res.status(401).json({ success: false, error: 'Authorization header required' });
    return null;
  }

  const machine = await resolveMachineTokenAccess(machineToken);
  if (!machine) {
    res.status(403).json({ success: false, error: 'Invalid machine token' });
    return null;
  }

  return machine;
}
