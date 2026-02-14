#!/usr/bin/env tsx

import { pool } from '../src/db/index.js';

interface ColumnSpec {
  name: string;
  sql: string;
}

const REQUEST_METADATA_COLUMNS: ColumnSpec[] = [
  {
    name: 'source',
    sql: 'ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "source" varchar(50) DEFAULT \'unknown\'',
  },
  {
    name: 'machine_hostname',
    sql: 'ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "machine_hostname" varchar(255)',
  },
  {
    name: 'origin_host',
    sql: 'ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "origin_host" varchar(255)',
  },
  {
    name: 'origin_page',
    sql: 'ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "origin_page" text',
  },
  {
    name: 'client_version',
    sql: 'ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "client_version" varchar(50)',
  },
  {
    name: 'error_type',
    sql: 'ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "error_type" varchar(100)',
  },
];

async function tableExists(tableName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
    `,
    [tableName]
  );

  return result.rows[0]?.exists === true;
}

async function existingColumns(tableName: string): Promise<Set<string>> {
  const result = await pool.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    [tableName]
  );

  return new Set(result.rows.map((row) => row.column_name));
}

async function main(): Promise<void> {
  console.log('Running idempotent request metadata migration...');

  const requestsTableExists = await tableExists('requests');
  if (!requestsTableExists) {
    throw new Error('Table "requests" does not exist. Run base schema migration first.');
  }

  const before = await existingColumns('requests');

  for (const column of REQUEST_METADATA_COLUMNS) {
    await pool.query(column.sql);
  }

  const after = await existingColumns('requests');

  for (const column of REQUEST_METADATA_COLUMNS) {
    const alreadyHadColumn = before.has(column.name);
    const hasColumnNow = after.has(column.name);

    if (!hasColumnNow) {
      throw new Error(`Column requests.${column.name} is still missing after migration`);
    }

    console.log(`${alreadyHadColumn ? 'unchanged' : 'added'}: requests.${column.name}`);
  }

  console.log('Request metadata migration completed successfully.');
}

main()
  .catch((error: unknown) => {
    console.error(
      'Request metadata migration failed:',
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
