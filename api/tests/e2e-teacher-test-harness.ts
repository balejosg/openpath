import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before } from 'node:test';

import { startHttpTestHarness, type HttpTestHarness } from './http-test-harness.js';
import {
  parseTRPC as parseTRPCBase,
  registerAndVerifyUser,
  resetDb,
  trpcMutate as trpcMutateBase,
  trpcQuery as trpcQueryBase,
  type AuthResult,
  type RequestResult,
  uniqueEmail,
} from './test-utils.js';

let harness: HttpTestHarness | undefined;
let testDataDir: string | null = null;

export interface TeacherScenario {
  adminToken: string;
  teacherEmail: string;
  teacherGroupId: string;
  teacherId: string;
  teacherToken: string;
}

export function registerTeacherE2ELifecycle(): void {
  before(async () => {
    testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpath-e2e-'));
    harness = await startHttpTestHarness({
      env: {
        DATA_DIR: testDataDir,
      },
      readyDelayMs: 1_000,
      resetDb: true,
      cleanup: () => {
        if (testDataDir !== null) {
          fs.rmSync(testDataDir, { recursive: true, force: true });
          testDataDir = null;
        }
      },
      resetDbOnClose: true,
    });
  });

  after(async () => {
    await harness?.close();
    harness = undefined;
  });
}

function getHarness(): HttpTestHarness {
  if (harness === undefined) {
    throw new Error('Teacher E2E harness has not been initialized');
  }

  return harness;
}

export async function trpcMutate(
  procedure: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  return trpcMutateBase(getHarness().apiUrl, procedure, input, headers);
}

export async function trpcQuery(
  procedure: string,
  input?: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  return trpcQueryBase(getHarness().apiUrl, procedure, input, headers);
}

export { parseTRPCBase as parseTRPC, resetDb };
export type { AuthResult, RequestResult };

async function createFirstAdminAndLogin(): Promise<string> {
  const email = uniqueEmail('maria-admin');
  const password = 'AdminPassword123!';

  const setupResponse = await trpcMutate('setup.createFirstAdmin', {
    email,
    password,
    name: 'Maria Admin',
  });
  if (setupResponse.status !== 200) {
    throw new Error(
      `Expected first admin creation to succeed, got ${String(setupResponse.status)}`
    );
  }

  const loginResponse = await trpcMutate('auth.login', {
    email,
    password,
  });
  if (loginResponse.status !== 200) {
    throw new Error(`Expected admin login to succeed, got ${String(loginResponse.status)}`);
  }

  const loginData = (await parseTRPCBase(loginResponse)).data as AuthResult;
  if (!loginData.accessToken) {
    throw new Error('Expected admin login to return an access token');
  }

  return loginData.accessToken;
}

async function createTeacherUser(
  adminToken: string,
  teacherEmail: string
): Promise<{
  teacherId: string;
  teacherToken: string;
}> {
  const teacherPassword = 'TeacherPassword123!';

  const createResponse = await trpcMutate(
    'users.create',
    {
      email: teacherEmail,
      password: teacherPassword,
      name: 'Pedro Profesor',
    },
    { Authorization: `Bearer ${adminToken}` }
  );

  let teacherId: string | null = null;

  if ([401, 403].includes(createResponse.status)) {
    const { registerResponse, registerData, verifyResponse } = await registerAndVerifyUser(
      getHarness().apiUrl,
      {
        email: teacherEmail,
        password: teacherPassword,
        name: 'Pedro Profesor',
      }
    );

    if (![200, 409].includes(registerResponse.status)) {
      throw new Error(
        `Expected teacher registration to succeed or conflict, got ${String(registerResponse.status)}`
      );
    }

    if (registerResponse.status === 200) {
      if (verifyResponse?.status !== 200) {
        throw new Error('Expected teacher verification to succeed');
      }
      teacherId = registerData?.user?.id ?? null;
    }
  } else {
    if (![200, 409].includes(createResponse.status)) {
      throw new Error(
        `Expected teacher creation to succeed or conflict, got ${String(createResponse.status)}`
      );
    }

    if (createResponse.status === 200) {
      const createData = (await parseTRPCBase(createResponse)).data as AuthResult;
      teacherId = createData.user?.id ?? null;
    }
  }

  const loginResponse = await trpcMutate('auth.login', {
    email: teacherEmail,
    password: teacherPassword,
  });
  if (loginResponse.status !== 200) {
    throw new Error(`Expected teacher login to succeed, got ${String(loginResponse.status)}`);
  }

  const loginData = (await parseTRPCBase(loginResponse)).data as AuthResult;
  teacherId ??= loginData.user?.id ?? null;
  const teacherToken = loginData.accessToken ?? null;

  if (teacherId === null || teacherToken === null || teacherToken === '') {
    throw new Error('Expected teacher creation flow to produce a valid teacher identity');
  }

  return { teacherId, teacherToken };
}

export async function provisionTeacherScenario(): Promise<TeacherScenario> {
  const adminToken = await createFirstAdminAndLogin();
  const teacherGroupName = `informatica-${Date.now().toString()}`;

  const groupResponse = await trpcMutate(
    'groups.create',
    {
      name: teacherGroupName,
      displayName: teacherGroupName,
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  if (![200, 201].includes(groupResponse.status)) {
    throw new Error(
      `Expected teacher group creation to succeed, got ${String(groupResponse.status)}`
    );
  }

  const groupData = (await parseTRPCBase(groupResponse)).data as { id?: string };
  const teacherGroupId = groupData.id ?? '';
  if (teacherGroupId === '') {
    throw new Error('Expected teacher group creation to return an id');
  }

  const teacherEmail = uniqueEmail('pedro-teacher');
  const { teacherId, teacherToken } = await createTeacherUser(adminToken, teacherEmail);

  const assignRoleResponse = await trpcMutate(
    'users.assignRole',
    {
      userId: teacherId,
      role: 'teacher',
      groupIds: [teacherGroupId],
    },
    { Authorization: `Bearer ${adminToken}` }
  );
  if (assignRoleResponse.status !== 200) {
    throw new Error(
      `Expected teacher role assignment to succeed, got ${String(assignRoleResponse.status)}`
    );
  }

  return {
    adminToken,
    teacherEmail,
    teacherGroupId,
    teacherId,
    teacherToken,
  };
}
