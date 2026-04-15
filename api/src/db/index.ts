/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Drizzle ORM Database Client
 * Main entry point for database operations.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import * as relations from './relations.js';
import {
  closeConnection as closePoolConnection,
  initializeSchema as runSchemaMigrations,
  testConnection as testPoolConnection,
} from './lifecycle.js';
import { pool } from './pool.js';

// =============================================================================
// Drizzle Client
// =============================================================================

export const db = drizzle(pool, {
  schema: { ...schema, ...relations },
});

export type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

export async function withTransaction<T>(operation: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => operation(tx));
}

// =============================================================================
// Re-export Schema and Types
// =============================================================================

export * from './schema.js';

// =============================================================================
// Legacy Compatibility Exports
// =============================================================================

// Export pool for legacy db.ts compatibility during migration
export { pool };

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  return testPoolConnection();
}

/**
 * Initialize database schema using Drizzle migrations.
 * Runs all pending migrations from the drizzle/ folder.
 * Safe to call on every startup - only applies new migrations.
 */
export async function initializeSchema(): Promise<boolean> {
  return runSchemaMigrations(db);
}

/**
 * Close the pool (for testing/shutdown)
 */
export async function closeConnection(): Promise<void> {
  await closePoolConnection();
}
