import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resetDb, TEST_RUN_ID } from './test-utils.js';
import { CANONICAL_GROUP_IDS } from './fixtures.js';
import { createScheduleBoundaryTicker } from '../src/lib/schedule-boundary-ticker.js';
import * as classroomStorage from '../src/lib/classroom-storage.js';
import * as scheduleStorage from '../src/lib/schedule-storage.js';
import { pool } from '../src/db/legacy-pool.js';
import { logger } from '../src/lib/logger.js';

function snapshotTickerEnv(): Record<string, string | undefined> {
  return {
    OPENPATH_SCHEDULE_TICKER: process.env.OPENPATH_SCHEDULE_TICKER,
    OPENPATH_SCHEDULE_TICKER_FORCE: process.env.OPENPATH_SCHEDULE_TICKER_FORCE,
    OPENPATH_SCHEDULE_TICKER_LOCK_NAME: process.env.OPENPATH_SCHEDULE_TICKER_LOCK_NAME,
    OPENPATH_SCHEDULE_TICKER_LOCK_SLOT: process.env.OPENPATH_SCHEDULE_TICKER_LOCK_SLOT,
  };
}

function restoreTickerEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
      continue;
    }

    process.env[key] = value;
  }
}

function createLockName(label: string): string {
  return `${label}-${TEST_RUN_ID}-${Date.now().toString()}-${Math.random().toString(16).slice(2)}`;
}

async function assertTickerLockAvailable(lockName: string, slot = 1): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1), $2) AS acquired',
      [lockName, slot]
    );
    assert.strictEqual(result.rows[0]?.acquired, true);
    await client.query('SELECT pg_advisory_unlock(hashtext($1), $2)', [lockName, slot]);
  } finally {
    client.release();
  }
}

await describe('Schedule Boundary Ticker', async () => {
  beforeEach(async () => {
    await resetDb();
  });

  await test('runTickOnce emits classroom IDs with boundary at HH:MM', async () => {
    const classroom = await classroomStorage.createClassroom({
      name: `ticker-room-${TEST_RUN_ID}`,
      displayName: 'Ticker Room',
    });

    await scheduleStorage.createSchedule({
      classroomId: classroom.id,
      teacherId: 'legacy_admin',
      groupId: CANONICAL_GROUP_IDS.groupA,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
    });

    const events: { classroomId: string; now: Date }[] = [];
    const ticker = createScheduleBoundaryTicker({
      emitClassroomChanged: (classroomId: string, now: Date) => {
        events.push({ classroomId, now });
      },
    });

    const boundaryNow = new Date(2026, 1, 23, 9, 0, 0); // Monday 09:00 local
    await ticker.runTickOnce(boundaryNow);

    assert.strictEqual(events.length, 1);
    const first = events[0];
    assert.ok(first);
    assert.strictEqual(first.classroomId, classroom.id);
  });

  await test('runTickOnce emits classroom IDs at one-off schedule startAt/endAt', async () => {
    const classroom = await classroomStorage.createClassroom({
      name: `ticker-oneoff-room-${TEST_RUN_ID}`,
      displayName: 'Ticker OneOff Room',
    });

    const startAt = new Date(2026, 1, 23, 11, 0, 0, 0);
    const endAt = new Date(2026, 1, 23, 12, 0, 0, 0);

    await scheduleStorage.createOneOffSchedule({
      classroomId: classroom.id,
      teacherId: 'legacy_admin',
      groupId: CANONICAL_GROUP_IDS.groupB,
      startAt,
      endAt,
    });

    const events: { classroomId: string; now: Date }[] = [];
    const ticker = createScheduleBoundaryTicker({
      emitClassroomChanged: (classroomId: string, now: Date) => {
        events.push({ classroomId, now });
      },
    });

    await ticker.runTickOnce(startAt);
    assert.strictEqual(events.length, 1);
    const atStart = events[0];
    assert.ok(atStart);
    assert.strictEqual(atStart.classroomId, classroom.id);

    events.length = 0;
    await ticker.runTickOnce(endAt);
    assert.strictEqual(events.length, 1);
    const atEnd = events[0];
    assert.ok(atEnd);
    assert.strictEqual(atEnd.classroomId, classroom.id);
  });

  await test('runTickOnce emits classroom IDs after expired machine exemptions are cleaned up', async () => {
    const classroom = await classroomStorage.createClassroom({
      name: `ticker-exemption-room-${TEST_RUN_ID}`,
      displayName: 'Ticker Exemption Room',
    });

    const machine = await classroomStorage.registerMachine({
      hostname: `ticker-exemption-machine-${TEST_RUN_ID}`,
      classroomId: classroom.id,
    });

    const schedule = await scheduleStorage.createSchedule({
      classroomId: classroom.id,
      teacherId: 'legacy_admin',
      groupId: CANONICAL_GROUP_IDS.groupA,
      dayOfWeek: 1,
      startTime: '07:00',
      endTime: '08:00',
    });

    const now = new Date(2026, 1, 23, 9, 15, 0);
    await pool.query(
      `
        INSERT INTO machine_exemptions (id, machine_id, classroom_id, schedule_id, created_by, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        `expired-exemption-${TEST_RUN_ID}`,
        machine.id,
        classroom.id,
        schedule.id,
        'legacy_admin',
        new Date(2026, 1, 23, 9, 0, 0),
      ]
    );

    const events: { classroomId: string; now: Date }[] = [];
    const ticker = createScheduleBoundaryTicker({
      emitClassroomChanged: (classroomId: string, emittedNow: Date) => {
        events.push({ classroomId, now: emittedNow });
      },
    });

    await ticker.runTickOnce(now);

    assert.strictEqual(events.length, 1);
    const first = events[0];
    assert.ok(first);
    assert.strictEqual(first.classroomId, classroom.id);
    assert.strictEqual(first.now, now);

    const remaining = await pool.query('SELECT id FROM machine_exemptions WHERE id = $1', [
      `expired-exemption-${TEST_RUN_ID}`,
    ]);
    assert.strictEqual(remaining.rowCount, 0);
  });

  await test('ensureStarted is a no-op while ticker remains disabled in tests', async () => {
    const envSnapshot = snapshotTickerEnv();
    const lockName = createLockName('ticker-disabled');

    delete process.env.OPENPATH_SCHEDULE_TICKER_FORCE;
    process.env.OPENPATH_SCHEDULE_TICKER_LOCK_NAME = lockName;

    const ticker = createScheduleBoundaryTicker({
      emitClassroomChanged: () => undefined,
    });

    try {
      await ticker.ensureStarted();
      await assertTickerLockAvailable(lockName);
    } finally {
      await ticker.stop();
      restoreTickerEnv(envSnapshot);
    }
  });

  await test('ensureStarted acquires leadership once and stop releases the advisory lock', async () => {
    const envSnapshot = snapshotTickerEnv();
    const lockName = createLockName('ticker-leader');
    const originalDateNow = Date.now;
    const originalInfo = logger.info;
    const originalWarn = logger.warn;
    const originalDebug = logger.debug;

    process.env.OPENPATH_SCHEDULE_TICKER_FORCE = '1';
    process.env.OPENPATH_SCHEDULE_TICKER_LOCK_NAME = lockName;

    const ticker = createScheduleBoundaryTicker({
      emitClassroomChanged: () => undefined,
    });

    try {
      Date.now = (): number => 120_000;
      logger.info = (): void => undefined;
      logger.warn = (): void => undefined;
      logger.debug = (): void => undefined;

      const firstStart = ticker.ensureStarted();
      const secondStart = ticker.ensureStarted();
      await Promise.all([firstStart, secondStart]);
      await ticker.ensureStarted();
      await ticker.stop();
      await ticker.stop();

      await assertTickerLockAvailable(lockName);
    } finally {
      Date.now = originalDateNow;
      logger.info = originalInfo;
      logger.warn = originalWarn;
      logger.debug = originalDebug;
      await ticker.stop();
      restoreTickerEnv(envSnapshot);
    }
  });

  await test('ensureStarted leaves follower instances in retry mode while a leader holds the lock', async () => {
    const envSnapshot = snapshotTickerEnv();
    const lockName = createLockName('ticker-follower');
    const originalInfo = logger.info;
    const originalWarn = logger.warn;
    const originalDebug = logger.debug;

    process.env.OPENPATH_SCHEDULE_TICKER_FORCE = '1';
    process.env.OPENPATH_SCHEDULE_TICKER_LOCK_NAME = lockName;

    const leader = createScheduleBoundaryTicker({
      emitClassroomChanged: () => undefined,
    });
    const follower = createScheduleBoundaryTicker({
      emitClassroomChanged: () => undefined,
    });

    try {
      logger.info = (): void => undefined;
      logger.warn = (): void => undefined;
      logger.debug = (): void => undefined;

      await leader.ensureStarted();
      await follower.ensureStarted();
      await follower.stop();
    } finally {
      logger.info = originalInfo;
      logger.warn = originalWarn;
      logger.debug = originalDebug;
      await follower.stop();
      await leader.stop();
      restoreTickerEnv(envSnapshot);
    }

    await assertTickerLockAvailable(lockName);
  });

  await test('ensureStarted logs and resets when the database connection fails', async () => {
    const envSnapshot = snapshotTickerEnv();
    const lockName = createLockName('ticker-connect-failure');
    const originalConnect = pool.connect.bind(pool);
    const originalWarn = logger.warn;
    const originalInfo = logger.info;
    const originalDebug = logger.debug;
    const warnings: string[] = [];

    process.env.OPENPATH_SCHEDULE_TICKER_FORCE = '1';
    process.env.OPENPATH_SCHEDULE_TICKER_LOCK_NAME = lockName;

    pool.connect = (() => Promise.reject(new Error('connect failed'))) as typeof pool.connect;
    logger.warn = ((message: string): void => {
      warnings.push(message);
    }) as typeof logger.warn;
    logger.info = (): void => undefined;
    logger.debug = (): void => undefined;

    const ticker = createScheduleBoundaryTicker({
      emitClassroomChanged: () => undefined,
    });

    try {
      await ticker.ensureStarted();
      await ticker.ensureStarted();
      assert.deepStrictEqual(warnings, [
        'Failed to start schedule boundary ticker',
        'Failed to start schedule boundary ticker',
      ]);
    } finally {
      pool.connect = originalConnect;
      logger.warn = originalWarn;
      logger.info = originalInfo;
      logger.debug = originalDebug;
      await ticker.stop();
      restoreTickerEnv(envSnapshot);
    }
  });
});
