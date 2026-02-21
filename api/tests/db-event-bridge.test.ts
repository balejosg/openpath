import { describe, test, after } from 'node:test';
import assert from 'node:assert';
import { pool } from '../src/db/index.js';
import { createDbEventBridge, type DbEventPayload } from '../src/lib/db-event-bridge.js';
import { TEST_RUN_ID } from './test-utils.js';

function sanitizeChannel(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, '_');
}

await describe('DB Event Bridge', async () => {
  const previous = process.env.OPENPATH_DB_EVENTS_CHANNEL;
  const channel = sanitizeChannel(`openpath_events_${TEST_RUN_ID}`);
  process.env.OPENPATH_DB_EVENTS_CHANNEL = channel;

  after(() => {
    process.env.OPENPATH_DB_EVENTS_CHANNEL = previous;
  });

  await test('delivers LISTEN/NOTIFY payloads to handler and ignores same-origin', async () => {
    const events: DbEventPayload[] = [];
    const bridge = createDbEventBridge({
      instanceId: 'instance-a',
      onEvent: (evt) => {
        events.push(evt);
      },
    });

    await bridge.ensureStarted();

    const gotEvent = new Promise<void>((resolve, reject) => {
      const interval = setInterval(() => {
        const hit = events.find((e) => e.type === 'group' && e.groupId === 'g1');
        if (!hit) return;
        clearInterval(interval);
        clearTimeout(timeout);
        resolve();
      }, 25);
      interval.unref();

      const timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error('Timed out waiting for DB event'));
      }, 4000);
    });

    await pool.query('SELECT pg_notify($1, $2)', [
      channel,
      JSON.stringify({ type: 'group', groupId: 'g1', origin: 'instance-b' }),
    ]);

    await pool.query('SELECT pg_notify($1, $2)', [
      channel,
      JSON.stringify({ type: 'group', groupId: 'ignored', origin: 'instance-a' }),
    ]);

    await gotEvent;

    assert.ok(events.some((e) => e.type === 'group' && e.groupId === 'g1'));
    assert.ok(!events.some((e) => e.type === 'group' && e.groupId === 'ignored'));

    await bridge.stop();
  });
});
