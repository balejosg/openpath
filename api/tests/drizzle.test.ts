import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
import { pool } from '../src/db/index.js';

await describe('Drizzle ORM Connection', async () => {
  after(async () => {
    await pool.end();
  });

  await test('should execute a simple query', async () => {
    const result = await db.execute(sql`SELECT 1`);
    const rows = result.rows;
    assert.ok(rows.length > 0);
    assert.deepStrictEqual(rows[0], { '?column?': 1 }); // Postgres returns ?column? for SELECT 1
  });

  await test('should have valid schema tables', async () => {
    // Check if tables exist by querying information_schema
    const result = await db.execute(sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
    const rows = result.rows as { table_name: string }[];
    const tables = rows.map((r) => r.table_name);

    const expectedTables = [
      'users',
      'roles',
      'tokens',
      'classrooms',
      'schedules',
      'requests',
      'machines',
      'settings',
    ];

    for (const table of expectedTables) {
      assert.ok(tables.includes(table), `Table ${table} should exist`);
    }
  });
});
