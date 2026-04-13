import { after, before } from 'node:test';
import { createHash } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '../src/db/index.js';
import { startHttpTestHarness, type HttpTestHarness } from './http-test-harness.js';

const DEFAULT_GROUP_ID = 'default';
const TEST_SHARED_SECRET = 'test-shared-secret';

let harness: HttpTestHarness | undefined;

export interface TRPCResponse<T = unknown> {
  result?: { data: T };
  error?: { message: string; code: string };
}

export function registerRequestApiLifecycle(): void {
  before(async () => {
    harness = await startHttpTestHarness({
      ensureSchema: true,
      env: {
        DEFAULT_GROUP: DEFAULT_GROUP_ID,
        ENABLE_RATE_LIMIT_IN_TEST: undefined,
        NODE_ENV: 'test',
        SHARED_SECRET: TEST_SHARED_SECRET,
      },
      cleanup: async () => {
        const { resetTokenStore } = await import('../src/lib/token-store.js');
        resetTokenStore();
      },
      readyDelayMs: 1_000,
    });

    await db.execute(
      sql.raw(
        `INSERT INTO whitelist_groups (id, name, display_name, enabled)
         VALUES ('${DEFAULT_GROUP_ID}', '${DEFAULT_GROUP_ID}', 'Default Group', 1)
         ON CONFLICT (id) DO NOTHING`
      )
    );
  });

  after(async () => {
    await harness?.close();
    harness = undefined;
  });
}

function getHarness(): HttpTestHarness {
  if (harness === undefined) {
    throw new Error('Request API harness has not been initialized');
  }

  return harness;
}

export function getApiUrl(): string {
  return getHarness().apiUrl;
}

export async function trpcMutate(
  procedure: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  return getHarness().trpcMutate(procedure, input, headers);
}

export async function trpcQuery(
  procedure: string,
  input?: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  return getHarness().trpcQuery(procedure, input, headers);
}

export async function parseTRPC(
  response: Response
): Promise<{ data?: unknown; error?: string; code?: string }> {
  const json = (await response.json()) as TRPCResponse;
  if (json.result !== undefined) {
    return { data: json.result.data };
  }
  if (json.error !== undefined) {
    return { code: json.error.code, error: json.error.message };
  }
  return {};
}

export function hashMachineToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function insertMachineAccessContext(input: {
  activeGroupId?: string | null;
  classroomId: string;
  defaultGroupId?: string | null;
  hostname: string;
  machineId: string;
  token: string;
  version?: string;
}): Promise<void> {
  if (input.activeGroupId !== undefined && input.activeGroupId !== null) {
    await insertWhitelistGroup(input.activeGroupId);
  }

  if (
    input.defaultGroupId !== undefined &&
    input.defaultGroupId !== null &&
    input.defaultGroupId !== input.activeGroupId
  ) {
    await insertWhitelistGroup(input.defaultGroupId);
  }

  await db.execute(
    sql.raw(
      `INSERT INTO classrooms (id, name, display_name, default_group_id, active_group_id)
       VALUES ('${input.classroomId}', '${input.classroomId}', '${input.classroomId}',
         ${toSqlNullableString(input.defaultGroupId)},
         ${toSqlNullableString(input.activeGroupId)})`
    )
  );
  await db.execute(
    sql.raw(
      `INSERT INTO machines (id, hostname, classroom_id, version, download_token_hash)
       VALUES ('${input.machineId}', '${input.hostname}', '${input.classroomId}',
         '${input.version ?? 'test'}', '${hashMachineToken(input.token)}')`
    )
  );
}

export async function insertWhitelistGroup(groupId: string): Promise<void> {
  await db.execute(
    sql.raw(
      `INSERT INTO whitelist_groups (id, name, display_name, enabled)
       VALUES ('${groupId}', '${groupId}', '${groupId}', 1)`
    )
  );
}

function toSqlNullableString(value: string | null | undefined): string {
  if (value === undefined || value === null) {
    return 'NULL';
  }

  return `'${value}'`;
}

export { db, DEFAULT_GROUP_ID };
