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
                server.close(() => { resolve(port); });
            } else {
                reject(new Error('Failed to get port'));
            }
        });
        server.on('error', reject);
    });
}


import { db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

/**
 * Reset database by truncating all tables
 * Useful for test isolation
 */
export async function resetDb(): Promise<void> {
    const tables = [
        'users',
        'roles',
        'tokens',
        'classrooms',
        'schedules',
        'requests',
        'machines',
        'settings',
        'whitelist_groups',
        'whitelist_rules'
    ];

    for (const table of tables) {
        await db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
    }

    // Insert legacy_admin user for FK constraints (required for tests using ADMIN_TOKEN)
    await db.execute(sql.raw(`
        INSERT INTO users (id, email, name, password_hash)
        VALUES ('legacy_admin', 'admin@openpath.dev', 'Legacy Admin', 'placeholder')
        ON CONFLICT (id) DO NOTHING
    `));
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
        body: JSON.stringify(input)
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
    const json = await response.json() as TRPCResponse;
    if (json.result !== undefined) {
        return { data: json.result.data };
    }
    if (json.error !== undefined) {
        return {
            error: json.error.message,
            code: json.error.data?.code ?? json.error.code
        };
    }
    return {};
}

/**
 * Create authorization header object for Bearer token
 */
export function bearerAuth(token: string | null): Record<string, string> {
    if (token === null || token === '') return {};
    return { 'Authorization': `Bearer ${token}` };
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
