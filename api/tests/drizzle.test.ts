import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { pool } from '../src/db/index.js';
import { getRows } from '../src/lib/utils.js';

await describe('Drizzle ORM Connection', async () => {
  after(async () => {
    await pool.end();
  });

  await test('should execute a simple query', async () => {
    const rows = getRows<{ '?column?': number }>(await db.execute(sql`SELECT 1`));
    assert.ok(rows.length > 0);
    assert.deepStrictEqual(rows[0], { '?column?': 1 }); // Postgres returns ?column? for SELECT 1
  });

  await test('should have valid schema tables', async () => {
    // Check if tables exist by querying information_schema
    const rows = getRows<{ table_name: string }>(
      await db.execute(sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `)
    );
    const tables = rows.map((r) => r.table_name);

    const expectedTables = [
      'users',
      'roles',
      'tokens',
      'classrooms',
      'schedules',
      'machine_exemptions',
      'requests',
      'machines',
      'settings',
    ];

    for (const table of expectedTables) {
      assert.ok(tables.includes(table), `Table ${table} should exist`);
    }
  });
});
