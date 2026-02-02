#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REQUIRED_TABLES = [
  'users',
  'roles',
  'machines',
  'classrooms',
  'schedules',
  'requests',
  'whitelist_groups',
  'whitelist_rules',
  'tokens',
  'push_subscriptions',
  'health_reports',
  'settings',
  'password_reset_tokens',
  'dashboard_users',
];

const CRITICAL_COLUMNS = {
  machines: ['download_token_hash', 'download_token_last_rotated_at'],
  users: ['google_id'],
};

function main(): void {
  const schemaPath = join(__dirname, '../src/db/schema.sql');
  let schemaSQL: string;

  try {
    schemaSQL = readFileSync(schemaPath, 'utf-8');
  } catch (err) {
    console.error(`❌ Failed to read schema.sql: ${(err as Error).message}`);
    process.exit(1);
  }

  let hasErrors = false;

  console.log('🔍 Verifying schema.sql consistency...\n');

  for (const table of REQUIRED_TABLES) {
    const tableRegex = new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`, 'i');
    if (!tableRegex.test(schemaSQL)) {
      console.error(`❌ Missing table: ${table}`);
      hasErrors = true;
    } else {
      console.log(`✅ Table exists: ${table}`);
    }
  }

  console.log('\n🔍 Verifying critical columns...\n');

  for (const [table, columns] of Object.entries(CRITICAL_COLUMNS)) {
    const tableMatch = new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"[\\s\\S]*?\\);`, 'i').exec(
      schemaSQL
    );

    if (!tableMatch) {
      console.error(`❌ Table ${table} not found in schema.sql`);
      hasErrors = true;
      continue;
    }

    const tableDefinition = tableMatch[0];

    for (const column of columns) {
      const columnRegex = new RegExp(`"${column}"`, 'i');
      if (!columnRegex.test(tableDefinition)) {
        console.error(`❌ Missing column: ${table}.${column}`);
        hasErrors = true;
      } else {
        console.log(`✅ Column exists: ${table}.${column}`);
      }
    }
  }

  const passwordHashNullable = /users[^;]*password_hash[^,)]*varchar\(255\)(?!\s+NOT NULL)/i.test(
    schemaSQL
  );
  if (!passwordHashNullable) {
    console.error('❌ users.password_hash should be nullable (for Google OAuth)');
    hasErrors = true;
  } else {
    console.log('✅ users.password_hash is nullable');
  }

  console.log('\n' + '='.repeat(50));

  if (hasErrors) {
    console.error('\n❌ Schema validation FAILED');
    console.error('\nTo fix: Update src/db/schema.sql to match src/db/schema.ts');
    console.error('Or run: npm run db:generate to regenerate migrations');
    process.exit(1);
  }

  console.log('\n✅ Schema validation PASSED');
  process.exit(0);
}

main();
