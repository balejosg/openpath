#!/usr/bin/env npx tsx
/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Dashboard User Migration Script
 *
 * Migrates users from the legacy dashboard_users table to the main users table
 * with admin role assignment. This enables unified authentication across
 * Dashboard and API.
 *
 * Usage:
 *   npx tsx api/scripts/migrate-dashboard-users.ts
 *
 * Options:
 *   --dry-run    Show what would be migrated without making changes
 *   --force      Skip confirmation prompt
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import * as readline from 'node:readline';

// Import schema
import { users, roles, dashboardUsers } from '../src/db/schema.js';

const { Pool } = pg;

// =============================================================================
// Configuration
// =============================================================================

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://openpath:openpath@localhost:5432/openpath';

const isDryRun = process.argv.includes('--dry-run');
const isForce = process.argv.includes('--force');

// =============================================================================
// Helpers
// =============================================================================

function log(message: string, data?: Record<string, unknown>): void {
  const prefix = isDryRun ? '[DRY RUN] ' : '';
  if (data) {
    console.log(`${prefix}${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix}${message}`);
  }
}

function logError(message: string, error?: unknown): void {
  console.error(`[ERROR] ${message}`, error instanceof Error ? error.message : String(error));
}

async function confirm(message: string): Promise<boolean> {
  if (isForce) return true;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// =============================================================================
// Migration Logic
// =============================================================================

interface MigrationResult {
  migrated: number;
  skipped: number;
  errors: number;
  details: {
    username: string;
    status: 'migrated' | 'skipped' | 'error';
    reason?: string;
    newUserId?: string;
  }[];
}

async function migrateDashboardUsers(): Promise<void> {
  log('Starting Dashboard User Migration');
  log('='.repeat(50));
  log(`Database: ${connectionString.replace(/:[^:@]+@/, ':***@')}`);
  log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  log('');

  // Connect to database
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  try {
    // Fetch all dashboard users
    const dashboardUserList = await db.select().from(dashboardUsers);

    if (dashboardUserList.length === 0) {
      log('No dashboard users found. Nothing to migrate.');
      return;
    }

    log(`Found ${String(dashboardUserList.length)} dashboard user(s) to migrate:`);
    for (const user of dashboardUserList) {
      log(`  - ${user.username} (role: ${user.role ?? 'none'})`);
    }
    log('');

    // Confirm migration
    if (!isDryRun) {
      const proceed = await confirm('Proceed with migration?');
      if (!proceed) {
        log('Migration cancelled.');
        return;
      }
      log('');
    }

    // Perform migration
    const result: MigrationResult = {
      migrated: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };

    for (const dashUser of dashboardUserList) {
      try {
        // Check if user already exists in users table (by email pattern)
        // Dashboard uses username, API uses email. We'll use username@dashboard.local as email
        const email = `${dashUser.username}@dashboard.local`;

        const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);

        if (existingUser) {
          log(`Skipping ${dashUser.username}: User already exists in users table`);
          result.skipped++;
          result.details.push({
            username: dashUser.username,
            status: 'skipped',
            reason: 'Already exists',
          });
          continue;
        }

        // Create new user in users table
        const newUserId = `user_${uuidv4().slice(0, 8)}`;

        if (!isDryRun) {
          // Insert user
          await db.insert(users).values({
            id: newUserId,
            email,
            name: dashUser.username,
            passwordHash: dashUser.passwordHash,
            isActive: true,
            emailVerified: true, // Dashboard users are pre-verified
          });

          // Assign admin role
          const roleId = `role_${uuidv4().slice(0, 8)}`;
          await db.insert(roles).values({
            id: roleId,
            userId: newUserId,
            role: 'admin',
            groupIds: [], // Admin has access to all groups
          });

          log(`Migrated ${dashUser.username} -> ${email} (ID: ${newUserId})`);
        } else {
          log(`Would migrate ${dashUser.username} -> ${email}`);
        }

        result.migrated++;
        result.details.push({
          username: dashUser.username,
          status: 'migrated',
          newUserId,
        });
      } catch (error) {
        logError(`Failed to migrate ${dashUser.username}`, error);
        result.errors++;
        result.details.push({
          username: dashUser.username,
          status: 'error',
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Summary
    log('');
    log('='.repeat(50));
    log('Migration Summary');
    log('='.repeat(50));
    log(`Migrated: ${String(result.migrated)}`);
    log(`Skipped:  ${String(result.skipped)}`);
    log(`Errors:   ${String(result.errors)}`);
    log('');

    if (result.migrated > 0 && !isDryRun) {
      log('Migration completed successfully!');
      log('');
      log('Important: Dashboard users can now log in using:');
      log('  Email: <username>@dashboard.local');
      log('  Password: (same as before)');
      log('');
      log('The dashboard_users table has been kept for rollback purposes.');
      log('You can delete it manually after verifying the migration.');
    }
  } catch (error) {
    logError('Migration failed', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// =============================================================================
// Main
// =============================================================================

migrateDashboardUsers().catch((error: unknown) => {
  logError('Unexpected error', error);
  process.exit(1);
});
