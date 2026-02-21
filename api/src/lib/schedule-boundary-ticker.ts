import type { PoolClient } from 'pg';
import { getErrorMessage } from '@openpath/shared';
import { pool } from '../db/index.js';
import { getClassroomIdsWithBoundaryAt } from './schedule-storage.js';
import { logger } from './logger.js';

export interface ScheduleBoundaryTicker {
  ensureStarted: () => Promise<void>;
  stop: () => Promise<void>;
  runTickOnce: (now?: Date) => Promise<void>;
}

function isScheduleTickerEnabled(): boolean {
  if (process.env.OPENPATH_SCHEDULE_TICKER === '0') return false;
  if (process.env.NODE_ENV === 'test' && process.env.OPENPATH_SCHEDULE_TICKER_FORCE !== '1') {
    return false;
  }
  return true;
}

export function createScheduleBoundaryTicker(params: {
  emitClassroomChanged: (classroomId: string, now: Date) => void;
}): ScheduleBoundaryTicker {
  const lockName = process.env.OPENPATH_SCHEDULE_TICKER_LOCK_NAME ?? 'openpath_schedule_ticker';
  const lockSlot = Number.parseInt(process.env.OPENPATH_SCHEDULE_TICKER_LOCK_SLOT ?? '1', 10);
  const retryMs = 30_000;

  let client: PoolClient | null = null;
  let startPromise: Promise<void> | null = null;
  let tickTimeout: NodeJS.Timeout | null = null;
  let tickInterval: NodeJS.Timeout | null = null;
  let retryTimeout: NodeJS.Timeout | null = null;

  async function runTickOnce(now: Date = new Date()): Promise<void> {
    const classroomIds = await getClassroomIdsWithBoundaryAt(now);
    if (classroomIds.length === 0) return;

    logger.debug('Schedule boundary tick', {
      classroomCount: classroomIds.length,
    });

    for (const classroomId of classroomIds) {
      params.emitClassroomChanged(classroomId, now);
    }
  }

  async function ensureStarted(): Promise<void> {
    if (!isScheduleTickerEnabled()) return;
    if (client) return;
    if (startPromise) {
      await startPromise;
      return;
    }

    startPromise = (async (): Promise<void> => {
      try {
        const c = await pool.connect();

        const normalizedSlot = Number.isFinite(lockSlot) ? lockSlot : 1;
        const lockResult = await c.query<{ acquired: boolean }>(
          'SELECT pg_try_advisory_lock(hashtext($1), $2) AS acquired',
          [lockName, normalizedSlot]
        );
        const acquired = lockResult.rows[0]?.acquired === true;

        if (!acquired) {
          c.release();

          retryTimeout = setTimeout(() => {
            retryTimeout = null;
            startPromise = null;
            void ensureStarted();
          }, retryMs);
          retryTimeout.unref();
          return;
        }

        client = c;

        c.on('error', (error: unknown) => {
          logger.warn('Schedule ticker DB client error', { error: getErrorMessage(error) });
          void stop();
        });

        logger.info('Schedule boundary ticker started (leader)', {
          lock: lockName,
          slot: normalizedSlot,
        });

        await runTickOnce();

        const msPastMinute = Date.now() % 60_000;
        let initialDelay = 60_000 - msPastMinute + 250;
        if (initialDelay > 60_000) initialDelay = 250;

        tickTimeout = setTimeout(() => {
          tickTimeout = null;
          void runTickOnce();

          tickInterval = setInterval(() => {
            void runTickOnce();
          }, 60_000);
          tickInterval.unref();
        }, initialDelay);
        tickTimeout.unref();
      } catch (error: unknown) {
        logger.warn('Failed to start schedule boundary ticker', { error: getErrorMessage(error) });
        try {
          client?.release();
        } catch {
          // ignore
        }
        client = null;
      } finally {
        startPromise = null;
      }
    })();

    await startPromise;
  }

  async function stop(): Promise<void> {
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }

    if (tickTimeout) {
      clearTimeout(tickTimeout);
      tickTimeout = null;
    }

    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }

    const c = client;
    if (!c) return;
    client = null;
    startPromise = null;

    try {
      const normalizedSlot = Number.isFinite(lockSlot) ? lockSlot : 1;
      await c.query('SELECT pg_advisory_unlock(hashtext($1), $2)', [lockName, normalizedSlot]);
    } catch {
      // ignore
    }

    try {
      c.removeAllListeners('error');
    } catch {
      // ignore
    }

    try {
      c.release();
    } catch {
      // ignore
    }
  }

  return {
    ensureStarted,
    stop,
    runTickOnce,
  };
}
