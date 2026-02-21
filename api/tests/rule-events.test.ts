/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Rule Events Unit Tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { firstSseDataPayload } from './sse-test-utils.js';
import {
  registerSseClient,
  emitWhitelistChanged,
  emitAllWhitelistsChanged,
  getListenerCount,
} from '../src/lib/rule-events.js';

await describe('Rule Events Lib', async () => {
  await test('should publish group changes only to matching clients', () => {
    const writesA: string[] = [];
    const writesB: string[] = [];

    const unsubA = registerSseClient({
      hostname: 'test-host-a',
      classroomId: 'room_a',
      groupId: 'group_a',
      stream: {
        write: (chunk: string) => {
          writesA.push(chunk);
          return true;
        },
      },
    });

    const unsubB = registerSseClient({
      hostname: 'test-host-b',
      classroomId: 'room_b',
      groupId: 'group_b',
      stream: {
        write: (chunk: string) => {
          writesB.push(chunk);
          return true;
        },
      },
    });

    assert.strictEqual(getListenerCount(), 2);

    emitWhitelistChanged('group_a');

    assert.ok(writesA.length > 0);
    assert.strictEqual(writesB.length, 0);

    const parsed = JSON.parse(firstSseDataPayload(writesA)) as { event?: string; groupId?: string };
    assert.strictEqual(parsed.event, 'whitelist-changed');
    assert.strictEqual(parsed.groupId, 'group_a');

    unsubA();
    unsubB();
    assert.strictEqual(getListenerCount(), 0);
  });

  await test('should broadcast to all clients on emitAllWhitelistsChanged', () => {
    const writesA: string[] = [];
    const writesB: string[] = [];

    const unsubA = registerSseClient({
      hostname: 'test-host-a2',
      classroomId: 'room_a2',
      groupId: 'group_a2',
      stream: {
        write: (chunk: string) => {
          writesA.push(chunk);
          return true;
        },
      },
    });

    const unsubB = registerSseClient({
      hostname: 'test-host-b2',
      classroomId: 'room_b2',
      groupId: 'group_b2',
      stream: {
        write: (chunk: string) => {
          writesB.push(chunk);
          return true;
        },
      },
    });

    emitAllWhitelistsChanged();

    assert.ok(writesA.join('').includes('"whitelist-changed"'));
    assert.ok(writesB.join('').includes('"whitelist-changed"'));

    unsubA();
    unsubB();
  });
});
