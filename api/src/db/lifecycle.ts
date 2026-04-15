import { logger } from '../lib/logger.js';
import { pool } from './pool.js';
import type { DbExecutor } from './index.js';

export async function testConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    logger.info('Database connection successful', { timestamp: result.rows[0] });
    return true;
  } catch (error) {
    logger.error('Database connection failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function initializeSchema(db: DbExecutor): Promise<boolean> {
  try {
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');

    const __dirname = path.dirname(fileURLToPath(import.meta.url));

    const possiblePaths = [
      path.join(__dirname, '..', '..', 'drizzle'),
      path.join(__dirname, '..', '..', '..', 'drizzle'),
      path.join(__dirname, '..', '..', '..', 'api', 'drizzle'),
    ];

    const fs = await import('node:fs');
    let migrationsFolder: string | null = null;
    for (const candidate of possiblePaths) {
      if (fs.existsSync(candidate)) {
        migrationsFolder = candidate;
        break;
      }
    }

    if (!migrationsFolder) {
      logger.error('Drizzle migrations folder not found', {
        searchedPaths: possiblePaths,
        cwd: process.cwd(),
        dirname: __dirname,
      });
      return false;
    }

    logger.info('Running database migrations', { migrationsFolder });
    await migrate(db as never, { migrationsFolder });
    logger.info('Database migrations completed successfully');
    return true;
  } catch (error) {
    logger.error('Failed to run database migrations', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return false;
  }
}

export async function closeConnection(): Promise<void> {
  await pool.end();
  logger.info('Database pool closed');
}
