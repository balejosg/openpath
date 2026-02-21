/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Rule Events Module
 * In-memory SSE hub for broadcasting whitelist change notifications
 * to connected agent clients.
 */

import { randomUUID } from 'node:crypto';
import type { Notification, PoolClient } from 'pg';
import { logger } from './logger.js';
import { pool } from '../db/index.js';
import { getErrorMessage } from '@openpath/shared';
import { resolveClassroomGroupContext } from './classroom-storage.js';
import { getClassroomIdsWithBoundaryAt } from './schedule-storage.js';

// =============================================================================
// Instance Identity (for NOTIFY de-duping)
// =============================================================================

const INSTANCE_ID = randomUUID();

// =============================================================================
// SSE Hub (indexed by groupId + classroomId)
// =============================================================================

export interface SseStream {
  write: (chunk: string) => boolean;
}

interface SseClient {
  id: string;
  hostname: string;
  classroomId: string;
  groupId: string;
  stream: SseStream;
  lastWriteAt: number;
}

const clientsById = new Map<string, SseClient>();
const clientIdsByGroupId = new Map<string, Set<string>>();
const clientIdsByClassroomId = new Map<string, Set<string>>();

const KEEP_ALIVE_INTERVAL_MS = 30_000;
const KEEP_ALIVE_IDLE_MS = 25_000;

let keepAliveTimer: NodeJS.Timeout | null = null;

function indexAdd(index: Map<string, Set<string>>, key: string, id: string): void {
  const set = index.get(key);
  if (set) {
    set.add(id);
    return;
  }
  index.set(key, new Set([id]));
}

function indexRemove(index: Map<string, Set<string>>, key: string, id: string): void {
  const set = index.get(key);
  if (!set) return;
  set.delete(id);
  if (set.size === 0) {
    index.delete(key);
  }
}

function stopKeepAliveIfIdle(): void {
  if (clientsById.size > 0) return;
  if (!keepAliveTimer) return;
  clearInterval(keepAliveTimer);
  keepAliveTimer = null;
}

function ensureKeepAliveRunning(): void {
  if (keepAliveTimer) return;

  keepAliveTimer = setInterval(() => {
    const now = Date.now();
    for (const client of clientsById.values()) {
      if (now - client.lastWriteAt < KEEP_ALIVE_IDLE_MS) continue;
      try {
        client.stream.write(': keep-alive\n\n');
        client.lastWriteAt = now;
      } catch {
        removeSseClient(client.id);
      }
    }
  }, KEEP_ALIVE_INTERVAL_MS);

  keepAliveTimer.unref();
}

function removeSseClient(id: string): void {
  const client = clientsById.get(id);
  if (!client) return;

  clientsById.delete(id);
  indexRemove(clientIdsByGroupId, client.groupId, id);
  indexRemove(clientIdsByClassroomId, client.classroomId, id);

  stopKeepAliveIfIdle();
}

function tryWrite(client: SseClient, payload: string): void {
  try {
    client.stream.write(payload);
    client.lastWriteAt = Date.now();
  } catch {
    removeSseClient(client.id);
  }
}

export function registerSseClient(params: {
  hostname: string;
  classroomId: string;
  groupId: string;
  stream: SseStream;
}): () => void {
  const id = randomUUID();
  const client: SseClient = {
    id,
    hostname: params.hostname,
    classroomId: params.classroomId,
    groupId: params.groupId,
    stream: params.stream,
    lastWriteAt: Date.now(),
  };

  clientsById.set(id, client);
  indexAdd(clientIdsByGroupId, client.groupId, id);
  indexAdd(clientIdsByClassroomId, client.classroomId, id);

  ensureKeepAliveRunning();

  return () => {
    removeSseClient(id);
  };
}

export function getSseClientCount(): number {
  return clientsById.size;
}

function publishGroupChangedLocal(groupId: string): void {
  const ids = clientIdsByGroupId.get(groupId);
  if (!ids || ids.size === 0) return;

  const payload = `data: ${JSON.stringify({ event: 'whitelist-changed', groupId })}\n\n`;
  for (const id of Array.from(ids)) {
    const client = clientsById.get(id);
    if (!client) continue;
    tryWrite(client, payload);
  }
}

function publishBroadcastLocal(): void {
  for (const client of clientsById.values()) {
    const payload = `data: ${JSON.stringify({
      event: 'whitelist-changed',
      groupId: client.groupId,
    })}\n\n`;
    tryWrite(client, payload);
  }
}

async function publishClassroomChangedLocal(
  classroomId: string,
  now: Date = new Date()
): Promise<void> {
  const ids = clientIdsByClassroomId.get(classroomId);
  if (!ids || ids.size === 0) return;

  const context = await resolveClassroomGroupContext(classroomId, now);
  if (!context) return;

  for (const id of Array.from(ids)) {
    const client = clientsById.get(id);
    if (!client) continue;

    if (client.groupId === context.groupId) continue;

    indexRemove(clientIdsByGroupId, client.groupId, id);
    client.groupId = context.groupId;
    indexAdd(clientIdsByGroupId, client.groupId, id);

    const payload = `data: ${JSON.stringify({
      event: 'whitelist-changed',
      groupId: client.groupId,
    })}\n\n`;
    tryWrite(client, payload);
  }
}

// =============================================================================
// Schedule Boundary Ticker (minute-aligned, leader-elected)
// =============================================================================

function isScheduleTickerEnabled(): boolean {
  if (process.env.OPENPATH_SCHEDULE_TICKER === '0') return false;
  if (process.env.NODE_ENV === 'test' && process.env.OPENPATH_SCHEDULE_TICKER_FORCE !== '1') {
    return false;
  }
  return true;
}

const SCHEDULE_TICKER_LOCK_NAME =
  process.env.OPENPATH_SCHEDULE_TICKER_LOCK_NAME ?? 'openpath_schedule_ticker';
const SCHEDULE_TICKER_LOCK_SLOT = Number.parseInt(
  process.env.OPENPATH_SCHEDULE_TICKER_LOCK_SLOT ?? '1',
  10
);

const SCHEDULE_TICKER_RETRY_MS = 30_000;

let scheduleTickerClient: PoolClient | null = null;
let scheduleTickerStartPromise: Promise<void> | null = null;
let scheduleTickerTimeout: NodeJS.Timeout | null = null;
let scheduleTickerInterval: NodeJS.Timeout | null = null;
let scheduleTickerRetryTimeout: NodeJS.Timeout | null = null;

export async function runScheduleBoundaryTickOnce(now: Date = new Date()): Promise<void> {
  const classroomIds = await getClassroomIdsWithBoundaryAt(now);
  if (classroomIds.length === 0) return;

  logger.debug('Schedule boundary tick', {
    classroomCount: classroomIds.length,
  });

  for (const classroomId of classroomIds) {
    emitClassroomChanged(classroomId, now);
  }
}

export async function ensureScheduleBoundaryTickerStarted(): Promise<void> {
  if (!isScheduleTickerEnabled()) return;
  if (scheduleTickerClient) return;
  if (scheduleTickerStartPromise) {
    await scheduleTickerStartPromise;
    return;
  }

  scheduleTickerStartPromise = (async (): Promise<void> => {
    try {
      const client = await pool.connect();

      const lockSlot = Number.isFinite(SCHEDULE_TICKER_LOCK_SLOT) ? SCHEDULE_TICKER_LOCK_SLOT : 1;
      const lockResult = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1), $2) AS acquired',
        [SCHEDULE_TICKER_LOCK_NAME, lockSlot]
      );

      const acquired = lockResult.rows[0]?.acquired === true;
      if (!acquired) {
        client.release();

        scheduleTickerRetryTimeout = setTimeout(() => {
          scheduleTickerRetryTimeout = null;
          scheduleTickerStartPromise = null;
          void ensureScheduleBoundaryTickerStarted();
        }, SCHEDULE_TICKER_RETRY_MS);
        scheduleTickerRetryTimeout.unref();
        return;
      }

      scheduleTickerClient = client;

      client.on('error', (error: unknown) => {
        logger.warn('Schedule ticker DB client error', { error: getErrorMessage(error) });
        void stopScheduleBoundaryTicker();
      });

      logger.info('Schedule boundary ticker started (leader)', {
        lock: SCHEDULE_TICKER_LOCK_NAME,
        slot: lockSlot,
      });

      await runScheduleBoundaryTickOnce();

      const msPastMinute = Date.now() % 60_000;
      let initialDelay = 60_000 - msPastMinute + 250;
      if (initialDelay > 60_000) initialDelay = 250;

      scheduleTickerTimeout = setTimeout(() => {
        scheduleTickerTimeout = null;
        void runScheduleBoundaryTickOnce();

        scheduleTickerInterval = setInterval(() => {
          void runScheduleBoundaryTickOnce();
        }, 60_000);

        scheduleTickerInterval.unref();
      }, initialDelay);

      scheduleTickerTimeout.unref();
    } catch (error: unknown) {
      logger.warn('Failed to start schedule boundary ticker', { error: getErrorMessage(error) });
      try {
        scheduleTickerClient?.release();
      } catch {
        // ignore
      }
      scheduleTickerClient = null;
    } finally {
      scheduleTickerStartPromise = null;
    }
  })();

  await scheduleTickerStartPromise;
}

export async function stopScheduleBoundaryTicker(): Promise<void> {
  if (scheduleTickerRetryTimeout) {
    clearTimeout(scheduleTickerRetryTimeout);
    scheduleTickerRetryTimeout = null;
  }

  if (scheduleTickerTimeout) {
    clearTimeout(scheduleTickerTimeout);
    scheduleTickerTimeout = null;
  }

  if (scheduleTickerInterval) {
    clearInterval(scheduleTickerInterval);
    scheduleTickerInterval = null;
  }

  const client = scheduleTickerClient;
  if (!client) return;
  scheduleTickerClient = null;

  try {
    const lockSlot = Number.isFinite(SCHEDULE_TICKER_LOCK_SLOT) ? SCHEDULE_TICKER_LOCK_SLOT : 1;
    await client.query('SELECT pg_advisory_unlock(hashtext($1), $2)', [
      SCHEDULE_TICKER_LOCK_NAME,
      lockSlot,
    ]);
  } catch {
    // ignore
  }

  try {
    client.removeAllListeners('error');
  } catch {
    // ignore
  }

  try {
    client.release();
  } catch {
    // ignore
  }
}

// =============================================================================
// Optional DB Event Bridge (Postgres LISTEN/NOTIFY)
// =============================================================================

const DB_EVENT_CHANNEL = ((): string => {
  const raw = process.env.OPENPATH_DB_EVENTS_CHANNEL ?? 'openpath_events';
  return /^[a-zA-Z0-9_]+$/.test(raw) ? raw : 'openpath_events';
})();

let dbBridgeClient: PoolClient | null = null;
let dbBridgeStartPromise: Promise<void> | null = null;

type DbEventPayload =
  | { type: 'group'; groupId: string; origin?: string }
  | { type: 'classroom'; classroomId: string; origin?: string }
  | { type: 'broadcast'; origin?: string };

async function notifyDbEvent(event: DbEventPayload): Promise<void> {
  try {
    await pool.query('SELECT pg_notify($1, $2)', [DB_EVENT_CHANNEL, JSON.stringify(event)]);
  } catch (error: unknown) {
    logger.warn('Failed to NOTIFY DB event channel', {
      channel: DB_EVENT_CHANNEL,
      error: getErrorMessage(error),
    });
  }
}

function handleDbNotification(payload: string | null): void {
  if (!payload) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return;
  }

  const evt = parsed as Partial<DbEventPayload>;

  if (evt.origin && evt.origin === INSTANCE_ID) {
    return;
  }

  if (evt.type === 'group' && typeof evt.groupId === 'string' && evt.groupId.length > 0) {
    publishGroupChangedLocal(evt.groupId);
    return;
  }

  if (
    evt.type === 'classroom' &&
    typeof evt.classroomId === 'string' &&
    evt.classroomId.length > 0
  ) {
    void publishClassroomChangedLocal(evt.classroomId);
    return;
  }

  if (evt.type === 'broadcast') {
    publishBroadcastLocal();
  }
}

/**
 * Start a best-effort DB->SSE bridge using Postgres LISTEN/NOTIFY.
 * Safe to call multiple times.
 */
export async function ensureDbEventBridgeStarted(): Promise<void> {
  if (dbBridgeClient) return;
  if (dbBridgeStartPromise) {
    await dbBridgeStartPromise;
    return;
  }

  dbBridgeStartPromise = (async (): Promise<void> => {
    try {
      const client = await pool.connect();
      dbBridgeClient = client;

      client.on('notification', (msg: Notification) => {
        handleDbNotification(msg.payload ?? null);
      });

      client.on('error', (err: unknown) => {
        logger.warn('DB event bridge client error', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      await client.query(`LISTEN ${DB_EVENT_CHANNEL}`);
      logger.info('DB event bridge listening', { channel: DB_EVENT_CHANNEL });
    } catch (error: unknown) {
      logger.warn('Failed to start DB event bridge', { error: getErrorMessage(error) });
      try {
        dbBridgeClient?.release();
      } catch {
        // ignore
      }
      dbBridgeClient = null;
      dbBridgeStartPromise = null;
    }
  })();

  await dbBridgeStartPromise;
}

export async function stopDbEventBridge(): Promise<void> {
  const client = dbBridgeClient;
  if (!client) return;

  dbBridgeClient = null;
  dbBridgeStartPromise = null;

  try {
    await client.query(`UNLISTEN ${DB_EVENT_CHANNEL}`);
  } catch {
    // ignore
  }

  try {
    client.removeAllListeners('notification');
    client.removeAllListeners('error');
  } catch {
    // ignore
  }

  try {
    client.release();
  } catch {
    // ignore
  }
}

/**
 * Emit a whitelist-changed event for a specific group.
 * Called after any rule mutation (create, update, delete, bulk operations).
 *
 * @param groupId - The group whose whitelist changed
 */
export function emitWhitelistChanged(groupId: string): void {
  logger.debug('Emitting whitelist-changed event', { groupId });
  publishGroupChangedLocal(groupId);
  void notifyDbEvent({ type: 'group', groupId, origin: INSTANCE_ID });
}

/**
 * Emit a classroom context-changed event.
 * Used when schedules or active-group overrides can change the effective group.
 */
export function emitClassroomChanged(classroomId: string, now?: Date): void {
  logger.debug('Emitting classroom-changed event', { classroomId });
  void publishClassroomChangedLocal(classroomId, now ?? new Date());
  void notifyDbEvent({ type: 'classroom', classroomId, origin: INSTANCE_ID });
}

/**
 * Emit whitelist-changed events for all groups.
 * Used when toggling the system status (enable/disable all groups).
 */
export function emitAllWhitelistsChanged(): void {
  logger.debug('Emitting whitelist-changed event for all groups');
  publishBroadcastLocal();
  void notifyDbEvent({ type: 'broadcast', origin: INSTANCE_ID });
}

/**
 * Backwards-compatible diagnostic: active SSE client count.
 */
export function getListenerCount(): number {
  return getSseClientCount();
}
