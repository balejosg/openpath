/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Shared Test Utilities
 *
 * This module provides common helpers for all test files to ensure:
 * - Test isolation via unique identifiers per run
 * - Consistent tRPC request/response handling
 * - Type-safe response parsing
 * - Dynamic port allocation to prevent conflicts
 */

import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import jwt from 'jsonwebtoken';
import { seedBaselineWhitelistGroups } from './fixtures.js';

/**
 * Get an available port by letting the OS assign one.
 * This prevents "address already in use" errors when running tests in parallel.
 */
export async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const addr = server.address();
      if (addr !== null && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => {
          resolve(port);
        });
      } else {
        reject(new Error('Failed to get port'));
      }
    });
    server.on('error', reject);
  });
}

import { db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

export async function ensureSchedulesOneOffSchema(): Promise<void> {
  const ensureSchedules = [
    'CREATE TABLE IF NOT EXISTS "schedules" (\n' +
      '  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n' +
      '  "classroom_id" varchar(50) NOT NULL,\n' +
      '  "teacher_id" varchar(50) NOT NULL,\n' +
      '  "group_id" varchar(100) NOT NULL,\n' +
      '  "day_of_week" integer,\n' +
      '  "start_time" time,\n' +
      '  "end_time" time,\n' +
      '  "start_at" timestamp with time zone,\n' +
      '  "end_at" timestamp with time zone,\n' +
      '  "recurrence" varchar(20) DEFAULT \'weekly\',\n' +
      '  "created_at" timestamp with time zone DEFAULT now(),\n' +
      '  "updated_at" timestamp with time zone DEFAULT now()\n' +
      ');',
    'ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "start_at" timestamp with time zone;',
    'ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "end_at" timestamp with time zone;',
    'ALTER TABLE "schedules" ALTER COLUMN "day_of_week" DROP NOT NULL;',
    'ALTER TABLE "schedules" ALTER COLUMN "start_time" DROP NOT NULL;',
    'ALTER TABLE "schedules" ALTER COLUMN "end_time" DROP NOT NULL;',
  ];

  for (const stmt of ensureSchedules) {
    await db.execute(sql.raw(stmt));
  }
}

async function ensureMachineExemptionsSchema(): Promise<void> {
  const ensureMachineExemptions = [
    'CREATE TABLE IF NOT EXISTS "machine_exemptions" (\n' +
      '  "id" varchar(50) PRIMARY KEY NOT NULL,\n' +
      '  "machine_id" varchar(50) NOT NULL,\n' +
      '  "classroom_id" varchar(50) NOT NULL,\n' +
      '  "schedule_id" uuid NOT NULL,\n' +
      '  "created_by" varchar(50),\n' +
      '  "created_at" timestamp with time zone DEFAULT now(),\n' +
      '  "expires_at" timestamp with time zone NOT NULL\n' +
      ');',
    'CREATE UNIQUE INDEX IF NOT EXISTS "machine_exemptions_machine_schedule_expires_key" ON "machine_exemptions" ("machine_id","schedule_id","expires_at");',
    'CREATE INDEX IF NOT EXISTS "machine_exemptions_classroom_expires_idx" ON "machine_exemptions" ("classroom_id","expires_at");',
    'CREATE INDEX IF NOT EXISTS "machine_exemptions_machine_expires_idx" ON "machine_exemptions" ("machine_id","expires_at");',
    'DO $$ BEGIN\n' +
      '  ALTER TABLE "machine_exemptions" ADD CONSTRAINT "machine_exemptions_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;\n' +
      'EXCEPTION\n' +
      '  WHEN duplicate_object THEN NULL;\n' +
      'END $$;',
    'DO $$ BEGIN\n' +
      '  ALTER TABLE "machine_exemptions" ADD CONSTRAINT "machine_exemptions_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;\n' +
      'EXCEPTION\n' +
      '  WHEN duplicate_object THEN NULL;\n' +
      'END $$;',
    'DO $$ BEGIN\n' +
      '  ALTER TABLE "machine_exemptions" ADD CONSTRAINT "machine_exemptions_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;\n' +
      'EXCEPTION\n' +
      '  WHEN duplicate_object THEN NULL;\n' +
      'END $$;',
    'DO $$ BEGIN\n' +
      '  ALTER TABLE "machine_exemptions" ADD CONSTRAINT "machine_exemptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;\n' +
      'EXCEPTION\n' +
      '  WHEN duplicate_object THEN NULL;\n' +
      'END $$;',
  ];

  for (const stmt of ensureMachineExemptions) {
    await db.execute(sql.raw(stmt));
  }
}

async function ensureMachinesSchema(): Promise<void> {
  await db.execute(
    sql.raw('ALTER TABLE "machines" ADD COLUMN IF NOT EXISTS "reported_hostname" varchar(255);')
  );
}

async function ensureEmailVerificationSchema(): Promise<void> {
  const statements = [
    'DO $$ BEGIN\n' +
      '  CREATE TABLE IF NOT EXISTS "email_verification_tokens" (\n' +
      '    "id" varchar(50) PRIMARY KEY NOT NULL,\n' +
      '    "user_id" varchar(50) NOT NULL,\n' +
      '    "token_hash" varchar(255) NOT NULL,\n' +
      '    "expires_at" timestamp with time zone NOT NULL,\n' +
      '    "created_at" timestamp with time zone DEFAULT now()\n' +
      '  );\n' +
      'EXCEPTION\n' +
      '  WHEN duplicate_table OR unique_violation THEN NULL;\n' +
      'END $$;',
    'DO $$ BEGIN\n' +
      '  ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;\n' +
      'EXCEPTION\n' +
      '  WHEN duplicate_object THEN NULL;\n' +
      'END $$;',
  ];

  for (const stmt of statements) {
    await db.execute(sql.raw(stmt));
  }
}

async function ensureGroupForeignKeyConstraints(): Promise<void> {
  const statements = [
    'ALTER TABLE "classrooms" DROP CONSTRAINT IF EXISTS "classrooms_default_group_id_whitelist_groups_id_fk";',
    'DO $$ BEGIN\n' +
      '  ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_default_group_id_whitelist_groups_id_fk" FOREIGN KEY ("default_group_id") REFERENCES "public"."whitelist_groups"("id") ON DELETE set null ON UPDATE no action;\n' +
      'EXCEPTION\n' +
      '  WHEN duplicate_object THEN NULL;\n' +
      'END $$;',
    'ALTER TABLE "classrooms" DROP CONSTRAINT IF EXISTS "classrooms_active_group_id_whitelist_groups_id_fk";',
    'DO $$ BEGIN\n' +
      '  ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_active_group_id_whitelist_groups_id_fk" FOREIGN KEY ("active_group_id") REFERENCES "public"."whitelist_groups"("id") ON DELETE set null ON UPDATE no action;\n' +
      'EXCEPTION\n' +
      '  WHEN duplicate_object THEN NULL;\n' +
      'END $$;',
    'ALTER TABLE "requests" DROP CONSTRAINT IF EXISTS "requests_group_id_whitelist_groups_id_fk";',
    'DO $$ BEGIN\n' +
      '  ALTER TABLE "requests" ADD CONSTRAINT "requests_group_id_whitelist_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."whitelist_groups"("id") ON DELETE cascade ON UPDATE no action;\n' +
      'EXCEPTION\n' +
      '  WHEN duplicate_object THEN NULL;\n' +
      'END $$;',
    'ALTER TABLE "schedules" DROP CONSTRAINT IF EXISTS "schedules_group_id_whitelist_groups_id_fk";',
    'DO $$ BEGIN\n' +
      '  ALTER TABLE "schedules" ADD CONSTRAINT "schedules_group_id_whitelist_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."whitelist_groups"("id") ON DELETE cascade ON UPDATE no action;\n' +
      'EXCEPTION\n' +
      '  WHEN duplicate_object THEN NULL;\n' +
      'END $$;',
  ];

  for (const stmt of statements) {
    await db.execute(sql.raw(stmt));
  }
}

export async function ensureTestSchema(): Promise<void> {
  await ensureSchedulesOneOffSchema();
  await ensureMachineExemptionsSchema();
  await ensureMachinesSchema();
  await ensureEmailVerificationSchema();
  await ensureGroupForeignKeyConstraints();
  await seedBaselineWhitelistGroups();
}

/**
 * Reset database by truncating all tables
 * Useful for test isolation
 */
export async function resetDb(): Promise<void> {
  // Tests run against a shared Postgres DB that may already have the base schema
  // (created outside of Drizzle's migration tracker). Ensure new tables exist
  // so truncation and FK-dependent tests remain stable.
  await ensureTestSchema();

  const tables = [
    'users',
    'roles',
    'tokens',
    'classrooms',
    'schedules',
    'machine_exemptions',
    'requests',
    'machines',
    'settings',
    'whitelist_groups',
    'whitelist_rules',
    'email_verification_tokens',
  ];

  for (const table of tables) {
    await db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
  }

  // The shared test database can keep legacy group FKs between runs.
  // Rebuild the canonical constraints on empty tables so cascade semantics
  // match the current schema before each suite seeds fixture data.
  await ensureGroupForeignKeyConstraints();

  // Insert legacy_admin user for fixtures that reuse that stable user id in FK-backed data.
  await db.execute(
    sql.raw(`
        INSERT INTO users (id, email, name, password_hash)
        VALUES ('legacy_admin', 'admin@openpath.dev', 'Legacy Admin', 'placeholder')
        ON CONFLICT (id) DO NOTHING
    `)
  );

  await seedBaselineWhitelistGroups();
}

// Unique identifier for this test run - used for email generation
export const TEST_RUN_ID = `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Generate a unique email address for this test run
 * @param prefix - Descriptive prefix like 'admin', 'teacher', etc.
 */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${TEST_RUN_ID}@test.local`;
}

/**
 * Generate a unique domain for this test run
 * @param prefix - Descriptive prefix
 */
export function uniqueDomain(prefix: string): string {
  return `${prefix}-${TEST_RUN_ID}.example.com`;
}

// Common type interfaces
export interface TRPCResponse<T = unknown> {
  result?: { data: T };
  error?: { message: string; code: string; data?: { code: string } };
}

export interface UserResult {
  id: string;
  email: string;
  name: string;
  roles?: { id: string; role: string; groupIds: string[] }[];
}

export interface AuthResult {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  user?: UserResult;
  verificationRequired?: boolean;
  verificationToken?: string;
  verificationExpiresAt?: string;
}

export interface RequestResult {
  id: string;
  domain?: string;
  status?: string;
  reason?: string;
}

export interface RoleResult {
  id: string;
  role: string;
  groupIds: string[];
}

/**
 * Helper to call tRPC mutations
 */
export async function trpcMutate(
  baseUrl: string,
  procedure: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  const response = await fetch(`${baseUrl}/trpc/${procedure}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(input),
  });
  return response;
}

/**
 * Helper to call tRPC queries
 */
export async function trpcQuery(
  baseUrl: string,
  procedure: string,
  input?: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  let url = `${baseUrl}/trpc/${procedure}`;
  if (input !== undefined) {
    url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
  }
  const response = await fetch(url, { headers });
  return response;
}

/**
 * Parse tRPC response into typed data or error
 */
export async function parseTRPC(response: Response): Promise<{
  data?: unknown;
  error?: string;
  code?: string;
}> {
  const json = (await response.json()) as TRPCResponse;
  if (json.result !== undefined) {
    return { data: json.result.data };
  }
  if (json.error !== undefined) {
    return {
      error: json.error.message,
      code: json.error.data?.code ?? json.error.code,
    };
  }
  return {};
}

/**
 * Create authorization header object for Bearer token
 */
export function bearerAuth(token: string | null): Record<string, string> {
  if (token === null || token === '') return {};
  return { Authorization: `Bearer ${token}` };
}

export function createLegacyAdminAccessToken(): string {
  const secret = process.env.JWT_SECRET;
  if (secret === undefined || secret === '') {
    throw new Error('JWT_SECRET must be set before creating test admin tokens');
  }

  return jwt.sign(
    {
      sub: 'legacy_admin',
      email: 'admin@openpath.dev',
      name: 'Legacy Admin',
      roles: [{ role: 'admin', groupIds: [] }],
      type: 'access',
    },
    secret,
    {
      issuer: 'openpath-api',
      expiresIn: '1h',
    }
  );
}

export async function bootstrapAdminSession(
  baseUrl: string,
  input: {
    email?: string;
    password?: string;
    name?: string;
  } = {}
): Promise<{ accessToken: string; email: string; password: string }> {
  const email = input.email ?? uniqueEmail('bootstrap-admin');
  const password = input.password ?? 'AdminPassword123!';
  const name = input.name ?? 'Bootstrap Admin';

  const setupResponse = await trpcMutate(baseUrl, 'setup.createFirstAdmin', {
    email,
    password,
    name,
  });
  if (![200, 201, 403, 409].includes(setupResponse.status)) {
    throw new Error(
      `Expected setup.createFirstAdmin to succeed, got ${String(setupResponse.status)}`
    );
  }

  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const loginResponse = await trpcMutate(baseUrl, 'auth.login', {
      email,
      password,
    });
    if (loginResponse.status === 200) {
      const authData = (await parseTRPC(loginResponse)).data as {
        accessToken?: string;
        user?: { roles?: { role?: string }[] };
      };
      const accessToken = authData.accessToken;
      const hasAdminRole = authData.user?.roles?.some((role) => role.role === 'admin') ?? false;

      if (accessToken !== undefined && accessToken !== '' && hasAdminRole) {
        return {
          accessToken,
          email,
          password,
        };
      }
    }

    await delay(100);
  }

  throw new Error('Expected bootstrap admin login to return an admin access token');
}

export async function registerAndVerifyUser(
  baseUrl: string,
  input: {
    email: string;
    password: string;
    name: string;
  },
  headers: Record<string, string> = {}
): Promise<{
  registerResponse: Response;
  registerData?: AuthResult;
  verifyResponse?: Response;
}> {
  const registerResponse = await trpcMutate(baseUrl, 'auth.register', input, headers);
  const { data } = (await parseTRPC(registerResponse)) as { data?: AuthResult };

  if (registerResponse.status !== 200) {
    return data ? { registerResponse, registerData: data } : { registerResponse };
  }

  let verificationToken = data?.verificationToken;
  if (!verificationToken) {
    const { default: AuthService } = await import('../src/services/auth.service.js');
    const internalResult = await AuthService.generateEmailVerificationToken(input.email);
    if (!internalResult.ok) {
      return data ? { registerResponse, registerData: data } : { registerResponse };
    }
    verificationToken = internalResult.data.verificationToken;
  }

  const verifyResponse = await trpcMutate(
    baseUrl,
    'auth.verifyEmail',
    {
      email: input.email,
      token: verificationToken,
    },
    headers
  );

  return data
    ? {
        registerResponse,
        registerData: data,
        verifyResponse,
      }
    : {
        registerResponse,
        verifyResponse,
      };
}

/**
 * Assert that a response has the expected status, with helpful error message
 */
export function assertStatus(response: Response, expected: number, message?: string): void {
  if (response.status !== expected) {
    const msg = message ?? `Expected status ${String(expected)}, got ${String(response.status)}`;
    throw new Error(msg);
  }
}
