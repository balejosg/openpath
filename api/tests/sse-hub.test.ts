import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createSseHub } from '../src/lib/sse-hub.js';
import { firstSseDataPayload } from './sse-test-utils.js';

await describe('SSE Hub', async () => {
  await test('publishGroupChangedLocal targets only matching group', () => {
    const writesA: string[] = [];
    const writesB: string[] = [];

    const hub = createSseHub({
      resolveClassroomGroupContext: () => Promise.resolve(null),
    });

    const unsubA = hub.registerSseClient({
      hostname: 'host-a',
      classroomId: 'room-a',
      groupId: 'group-a',
      stream: {
        write: (chunk: string) => {
          writesA.push(chunk);
          return true;
        },
      },
    });

    const unsubB = hub.registerSseClient({
      hostname: 'host-b',
      classroomId: 'room-b',
      groupId: 'group-b',
      stream: {
        write: (chunk: string) => {
          writesB.push(chunk);
          return true;
        },
      },
    });

    hub.publishGroupChangedLocal('group-a');

    assert.ok(writesA.length > 0);
    assert.strictEqual(writesB.length, 0);

    const parsed = JSON.parse(firstSseDataPayload(writesA)) as { event?: string; groupId?: string };
    assert.strictEqual(parsed.event, 'whitelist-changed');
    assert.strictEqual(parsed.groupId, 'group-a');

    unsubA();
    unsubB();
  });

  await test('publishClassroomChangedLocal updates group index and emits new groupId', async () => {
    const writes: string[] = [];
    const hub = createSseHub({
      resolveClassroomGroupContext: () => Promise.resolve({ groupId: 'new-group' }),
    });

    const unsub = hub.registerSseClient({
      hostname: 'host-c',
      classroomId: 'room-c',
      groupId: 'old-group',
      stream: {
        write: (chunk: string) => {
          writes.push(chunk);
          return true;
        },
      },
    });

    await hub.publishClassroomChangedLocal('room-c', new Date(2026, 1, 23, 9, 0, 0));

    const change = JSON.parse(firstSseDataPayload(writes)) as { event?: string; groupId?: string };
    assert.strictEqual(change.event, 'whitelist-changed');
    assert.strictEqual(change.groupId, 'new-group');

    writes.length = 0;
    hub.publishGroupChangedLocal('new-group');
    assert.ok(writes.join('').includes('"new-group"'));

    unsub();
  });
});
