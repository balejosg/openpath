import type { Notification, PoolClient } from 'pg';
import { getErrorMessage } from '@openpath/shared';
import { pool } from '../db/index.js';
import { logger } from './logger.js';

export type DbEventPayload =
  | { type: 'group'; groupId: string; origin?: string }
  | { type: 'classroom'; classroomId: string; origin?: string }
  | { type: 'broadcast'; origin?: string };

export interface DbEventBridge {
  ensureStarted: () => Promise<void>;
  stop: () => Promise<void>;
  notify: (event: DbEventPayload) => Promise<void>;
}

function resolveDbEventChannel(): string {
  const raw = process.env.OPENPATH_DB_EVENTS_CHANNEL ?? 'openpath_events';
  return /^[a-zA-Z0-9_]+$/.test(raw) ? raw : 'openpath_events';
}

export function createDbEventBridge(params: {
  instanceId: string;
  onEvent: (event: DbEventPayload) => void;
}): DbEventBridge {
  const channel = resolveDbEventChannel();

  let client: PoolClient | null = null;
  let startPromise: Promise<void> | null = null;

  async function notify(event: DbEventPayload): Promise<void> {
    try {
      await pool.query('SELECT pg_notify($1, $2)', [channel, JSON.stringify(event)]);
    } catch (error: unknown) {
      logger.warn('Failed to NOTIFY DB event channel', {
        channel,
        error: getErrorMessage(error),
      });
    }
  }

  function handleNotificationPayload(payload: string | null): void {
    if (!payload) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }

    const evt = parsed as Partial<DbEventPayload>;

    if (evt.origin && evt.origin === params.instanceId) {
      return;
    }

    if (evt.type === 'group' && typeof evt.groupId === 'string' && evt.groupId.length > 0) {
      const origin = evt.origin;
      params.onEvent(
        origin
          ? { type: 'group', groupId: evt.groupId, origin }
          : { type: 'group', groupId: evt.groupId }
      );
      return;
    }

    if (
      evt.type === 'classroom' &&
      typeof evt.classroomId === 'string' &&
      evt.classroomId.length > 0
    ) {
      const origin = evt.origin;
      params.onEvent(
        origin
          ? { type: 'classroom', classroomId: evt.classroomId, origin }
          : { type: 'classroom', classroomId: evt.classroomId }
      );
      return;
    }

    if (evt.type === 'broadcast') {
      const origin = evt.origin;
      params.onEvent(origin ? { type: 'broadcast', origin } : { type: 'broadcast' });
    }
  }

  async function ensureStarted(): Promise<void> {
    if (client) return;
    if (startPromise) {
      await startPromise;
      return;
    }

    startPromise = (async (): Promise<void> => {
      try {
        const c = await pool.connect();
        client = c;

        c.on('notification', (msg: Notification) => {
          handleNotificationPayload(msg.payload ?? null);
        });

        c.on('error', (err: unknown) => {
          logger.warn('DB event bridge client error', {
            error: err instanceof Error ? err.message : String(err),
          });
        });

        await c.query(`LISTEN ${channel}`);
        logger.info('DB event bridge listening', { channel });
      } catch (error: unknown) {
        logger.warn('Failed to start DB event bridge', { error: getErrorMessage(error) });
        try {
          client?.release();
        } catch {
          // ignore
        }
        client = null;
        startPromise = null;
      }
    })();

    await startPromise;
  }

  async function stop(): Promise<void> {
    const c = client;
    if (!c) return;

    client = null;
    startPromise = null;

    try {
      await c.query(`UNLISTEN ${channel}`);
    } catch {
      // ignore
    }

    try {
      c.removeAllListeners('notification');
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
    notify,
  };
}
