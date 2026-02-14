/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Rule Events Unit Tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  onWhitelistChanged,
  emitWhitelistChanged,
  emitAllWhitelistsChanged,
  getListenerCount,
} from '../src/lib/rule-events.js';

await describe('Rule Events Lib', async () => {
  await test('should register and trigger group-specific listeners', async () => {
    let triggered = false;

    const unsubscribe = onWhitelistChanged('test-group-1', () => {
      triggered = true;
    });

    assert.strictEqual(getListenerCount(), 1);

    emitWhitelistChanged('test-group-1');
    assert.strictEqual(triggered, true);

    unsubscribe();
    assert.strictEqual(getListenerCount(), 0);

    // Should not trigger after unsubscribe
    triggered = false;
    emitWhitelistChanged('test-group-1');
    assert.strictEqual(triggered, false);
  });

  await test('should trigger listeners for wildcard emissions', async () => {
    let triggered = false;
    const unsubscribe = onWhitelistChanged('test-group-2', () => {
      triggered = true;
    });

    emitAllWhitelistsChanged();
    assert.strictEqual(triggered, true);

    unsubscribe();
  });

  await test('should not trigger listeners for different groups', async () => {
    let triggered = false;
    const unsubscribe = onWhitelistChanged('test-group-3', () => {
      triggered = true;
    });

    emitWhitelistChanged('other-group');
    assert.strictEqual(triggered, false);

    unsubscribe();
  });

  await test('should support multiple listeners on same group', async () => {
    let count = 0;
    const unsub1 = onWhitelistChanged('multi-group', () => count++);
    const unsub2 = onWhitelistChanged('multi-group', () => count++);

    emitWhitelistChanged('multi-group');
    assert.strictEqual(count, 2);

    unsub1();
    unsub2();
  });
});
