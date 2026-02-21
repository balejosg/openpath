/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * SSE (Server-Sent Events) Endpoint Tests
 *
 * Tests the real-time rule update notification system via SSE.
 * Run with: npm run test:sse
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import {
  getAvailablePort,
  trpcMutate,
  parseTRPC,
  bearerAuth,
  assertStatus,
  TEST_RUN_ID,
  resetDb,
} from './test-utils.js';
import { createSseTestClient } from './sse-test-utils.js';
import { closeConnection, pool } from '../src/db/index.js';
import {
  runScheduleBoundaryTickOnce,
  stopDbEventBridge,
  stopScheduleBoundaryTicker,
} from '../src/lib/rule-events.js';
import { generateMachineToken, hashMachineToken } from '../src/lib/machine-download-token.js';
import * as classroomStorage from '../src/lib/classroom-storage.js';
import * as scheduleStorage from '../src/lib/schedule-storage.js';

let PORT: number;
let API_URL: string;

// Global timeout - force exit if tests hang (30s)
const GLOBAL_TIMEOUT = setTimeout(() => {
  console.error('\n❌ SSE tests timed out! Forcing exit...');
  process.exit(1);
}, 30000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;
const ADMIN_TOKEN = 'test-admin-token';

// Test data
let testGroupId: string;
let testMachineToken: string;

// =============================================================================
// Tests
// =============================================================================

await describe('SSE Endpoint (/api/machines/events)', { timeout: 30000 }, async () => {
  before(async () => {
    await resetDb();

    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;

    const { app } = await import('../src/server.js');

    server = app.listen(PORT, () => {
      console.log(`SSE test server started on port ${String(PORT)}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create a test group
    const groupResp = await trpcMutate(
      API_URL,
      'groups.create',
      { name: `sse-test-${TEST_RUN_ID}`, displayName: 'SSE Test Group' },
      bearerAuth(ADMIN_TOKEN)
    );
    assertStatus(groupResp, 200);
    const { data: groupData } = (await parseTRPC(groupResp)) as {
      data?: { id: string; name: string };
    };
    testGroupId = groupData?.id ?? '';

    // Create a classroom linked to this group
    const classroom = await classroomStorage.createClassroom({
      name: `sse-room-${TEST_RUN_ID}`,
      displayName: 'SSE Test Room',
      defaultGroupId: testGroupId,
    });

    // Register a machine in the classroom and set its download token
    const machine = await classroomStorage.registerMachine({
      hostname: `sse-test-machine-${TEST_RUN_ID}`,
      classroomId: classroom.id,
    });

    testMachineToken = generateMachineToken();
    const tokenHash = hashMachineToken(testMachineToken);
    await classroomStorage.setMachineDownloadTokenHash(machine.id, tokenHash);
  });

  after(async () => {
    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          console.log('SSE test server closed');
          resolve();
        });
      });
    }
    await stopDbEventBridge();
    await stopScheduleBoundaryTicker();
    await closeConnection();
  });

  // =========================================================================
  // Authentication Tests
  // =========================================================================
  await describe('Authentication', async () => {
    await test('should reject requests without token', async () => {
      const response = await fetch(`${API_URL}/api/machines/events`);
      assert.strictEqual(response.status, 401);
    });

    await test('should reject requests with invalid token (query param)', async () => {
      const response = await fetch(`${API_URL}/api/machines/events?token=invalid-token`);
      assert.strictEqual(response.status, 403);
    });

    await test('should reject requests with invalid Bearer token', async () => {
      const response = await fetch(`${API_URL}/api/machines/events`, {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      assert.strictEqual(response.status, 403);
    });

    await test('should accept requests with valid Bearer token', async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 2000);

      try {
        const response = await fetch(`${API_URL}/api/machines/events`, {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${testMachineToken}` },
        });

        assert.strictEqual(response.status, 200);

        const contentType = response.headers.get('content-type');
        assert.ok(
          contentType?.includes('text/event-stream'),
          `Expected text/event-stream, got ${String(contentType)}`
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          // Expected — connection was aborted after header check
        } else {
          throw error;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    });

    await test('should accept requests with valid query param token (backward compat)', async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 2000);

      try {
        const response = await fetch(`${API_URL}/api/machines/events?token=${testMachineToken}`, {
          signal: controller.signal,
        });

        assert.strictEqual(response.status, 200);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          // Expected
        } else {
          throw error;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    });
  });

  // =========================================================================
  // SSE Connection Tests
  // =========================================================================
  await describe('SSE Connection', async () => {
    await test('should send initial "connected" event', async () => {
      const client = createSseTestClient({
        url: `${API_URL}/api/machines/events`,
        headers: { Authorization: `Bearer ${testMachineToken}` },
      });

      try {
        const response = await client.connect();
        assert.strictEqual(response.status, 200);

        const contentType = response.headers.get('content-type');
        assert.ok(
          contentType?.includes('text/event-stream'),
          `Expected text/event-stream, got ${String(contentType)}`
        );

        const connectedEvent = (await client.waitFor(
          (event) => event.event === 'connected',
          5000,
          'connected event'
        )) as { event?: string; groupId?: string };

        assert.strictEqual(connectedEvent.event, 'connected');
        assert.strictEqual(connectedEvent.groupId, testGroupId);
      } finally {
        client.close();
      }
    });
  });

  // =========================================================================
  // Real-time Event Tests
  // =========================================================================
  await describe('Real-time Events', async () => {
    await test('should receive whitelist-changed event when a rule is created', async () => {
      const client = createSseTestClient({
        url: `${API_URL}/api/machines/events`,
        headers: { Authorization: `Bearer ${testMachineToken}` },
      });

      let createTimeoutId: ReturnType<typeof setTimeout> | undefined;

      try {
        await client.connect();
        await client.waitFor((event) => event.event === 'connected', 5000, 'connected event');

        createTimeoutId = setTimeout(() => {
          void trpcMutate(
            API_URL,
            'groups.createRule',
            {
              groupId: testGroupId,
              type: 'whitelist',
              value: `sse-test-${TEST_RUN_ID}.com`,
            },
            bearerAuth(ADMIN_TOKEN)
          );
        }, 500);

        const changeEvent = (await client.waitFor(
          (event) => event.event === 'whitelist-changed',
          8000,
          'whitelist-changed event'
        )) as { event?: string; groupId?: string };

        assert.strictEqual(changeEvent.event, 'whitelist-changed');
        assert.strictEqual(changeEvent.groupId, testGroupId);
      } finally {
        if (createTimeoutId !== undefined) {
          clearTimeout(createTimeoutId);
        }
        client.close();
      }
    });

    await test('should receive whitelist-changed event when DB NOTIFY is sent', async () => {
      const client = createSseTestClient({
        url: `${API_URL}/api/machines/events`,
        headers: { Authorization: `Bearer ${testMachineToken}` },
      });

      let notifyTimeoutId: ReturnType<typeof setTimeout> | undefined;

      try {
        await client.connect();
        await client.waitFor((event) => event.event === 'connected', 5000, 'connected event');

        notifyTimeoutId = setTimeout(() => {
          void pool.query('SELECT pg_notify($1, $2)', [
            'openpath_events',
            JSON.stringify({ type: 'group', groupId: testGroupId }),
          ]);
        }, 250);

        const changeEvent = (await client.waitFor(
          (event) => event.event === 'whitelist-changed',
          8000,
          'whitelist-changed event'
        )) as { event?: string; groupId?: string };

        assert.strictEqual(changeEvent.event, 'whitelist-changed');
        assert.strictEqual(changeEvent.groupId, testGroupId);
      } finally {
        if (notifyTimeoutId !== undefined) {
          clearTimeout(notifyTimeoutId);
        }
        client.close();
      }
    });

    await test('should emit whitelist-changed on schedule boundary tick', async () => {
      // Create a dedicated default group for this test
      const defaultGroupResp = await trpcMutate(
        API_URL,
        'groups.create',
        { name: `sse-sched-default-${TEST_RUN_ID}`, displayName: 'SSE Schedule Default Group' },
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(defaultGroupResp, 200);
      const { data: defaultGroupData } = (await parseTRPC(defaultGroupResp)) as {
        data?: { id: string };
      };
      const defaultGroupId = defaultGroupData?.id ?? '';
      assert.ok(defaultGroupId, 'Expected default group ID');

      // Create a second group to switch to
      const scheduleGroupResp = await trpcMutate(
        API_URL,
        'groups.create',
        { name: `sse-sched-${TEST_RUN_ID}`, displayName: 'SSE Schedule Group' },
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(scheduleGroupResp, 200);
      const { data: scheduleGroupData } = (await parseTRPC(scheduleGroupResp)) as {
        data?: { id: string };
      };
      const scheduleGroupId = scheduleGroupData?.id ?? '';
      assert.ok(scheduleGroupId, 'Expected schedule group ID');

      // Classroom defaults to defaultGroupId but will switch to scheduleGroupId at boundary time
      const classroom = await classroomStorage.createClassroom({
        name: `sse-sched-room-${TEST_RUN_ID}`,
        displayName: 'SSE Schedule Room',
        defaultGroupId: defaultGroupId,
      });

      const machine = await classroomStorage.registerMachine({
        hostname: `sse-sched-machine-${TEST_RUN_ID}`,
        classroomId: classroom.id,
      });

      const token = generateMachineToken();
      await classroomStorage.setMachineDownloadTokenHash(machine.id, hashMachineToken(token));

      await scheduleStorage.createSchedule({
        classroomId: classroom.id,
        teacherId: 'legacy_admin',
        groupId: scheduleGroupId,
        dayOfWeek: 1, // Monday
        startTime: '09:00',
        endTime: '10:00',
      });

      const boundaryNow = new Date(2026, 1, 23, 9, 0, 0); // Mon 09:00 local

      const client = createSseTestClient({
        url: `${API_URL}/api/machines/events`,
        headers: { Authorization: `Bearer ${token}` },
      });

      let tickTimeoutId: ReturnType<typeof setTimeout> | undefined;

      try {
        await client.connect();
        await client.waitFor((event) => event.event === 'connected', 5000, 'connected event');

        tickTimeoutId = setTimeout(() => {
          void runScheduleBoundaryTickOnce(boundaryNow);
        }, 150);

        const changed = (await client.waitFor(
          (event) => event.event === 'whitelist-changed',
          8000,
          'whitelist-changed event (schedule tick)'
        )) as { event?: string; groupId?: string };

        assert.strictEqual(changed.event, 'whitelist-changed');
        assert.strictEqual(changed.groupId, scheduleGroupId);
      } finally {
        if (tickTimeoutId !== undefined) {
          clearTimeout(tickTimeoutId);
        }
        client.close();
      }
    });

    await test('should not broadcast classroom DB NOTIFY to other classrooms', async () => {
      // Dedicated default group for classroom A
      const classroomADefaultResp = await trpcMutate(
        API_URL,
        'groups.create',
        { name: `sse-classroom-a-default-${TEST_RUN_ID}`, displayName: 'SSE Classroom A Default' },
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(classroomADefaultResp, 200);
      const { data: classroomADefaultData } = (await parseTRPC(classroomADefaultResp)) as {
        data?: { id: string };
      };
      const classroomADefaultGroupId = classroomADefaultData?.id ?? '';
      assert.ok(classroomADefaultGroupId, 'Expected classroom A default group ID');

      // Create a second group to use as an override
      const overrideGroupResp = await trpcMutate(
        API_URL,
        'groups.create',
        { name: `sse-override-${TEST_RUN_ID}`, displayName: 'SSE Override Group' },
        bearerAuth(ADMIN_TOKEN)
      );
      assertStatus(overrideGroupResp, 200);
      const { data: overrideGroupData } = (await parseTRPC(overrideGroupResp)) as {
        data?: { id: string };
      };
      const overrideGroupId = overrideGroupData?.id ?? '';
      assert.ok(overrideGroupId, 'Expected override group ID');

      // Two separate classrooms with one machine each
      const classroomA = await classroomStorage.createClassroom({
        name: `sse-classroom-a-${TEST_RUN_ID}`,
        displayName: 'SSE Classroom A',
        defaultGroupId: classroomADefaultGroupId,
      });

      const machineA = await classroomStorage.registerMachine({
        hostname: `sse-machine-a-${TEST_RUN_ID}`,
        classroomId: classroomA.id,
      });
      const tokenA = generateMachineToken();
      await classroomStorage.setMachineDownloadTokenHash(machineA.id, hashMachineToken(tokenA));

      const classroomB = await classroomStorage.createClassroom({
        name: `sse-classroom-b-${TEST_RUN_ID}`,
        displayName: 'SSE Classroom B',
        defaultGroupId: overrideGroupId,
      });

      const machineB = await classroomStorage.registerMachine({
        hostname: `sse-machine-b-${TEST_RUN_ID}`,
        classroomId: classroomB.id,
      });
      const tokenB = generateMachineToken();
      await classroomStorage.setMachineDownloadTokenHash(machineB.id, hashMachineToken(tokenB));

      const clientA = createSseTestClient({
        url: `${API_URL}/api/machines/events`,
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const clientB = createSseTestClient({
        url: `${API_URL}/api/machines/events`,
        headers: { Authorization: `Bearer ${tokenB}` },
      });

      let notifyTimeoutId: ReturnType<typeof setTimeout> | undefined;

      try {
        await Promise.all([clientA.connect(), clientB.connect()]);

        await Promise.all([
          clientA.waitFor((event) => event.event === 'connected', 5000, 'connected event (A)'),
          clientB.waitFor((event) => event.event === 'connected', 5000, 'connected event (B)'),
        ]);

        notifyTimeoutId = setTimeout(() => {
          void (async (): Promise<void> => {
            await classroomStorage.setActiveGroup(classroomA.id, overrideGroupId);
            await pool.query('SELECT pg_notify($1, $2)', [
              'openpath_events',
              JSON.stringify({ type: 'classroom', classroomId: classroomA.id }),
            ]);
          })();
        }, 250);

        const gotAPromise = clientA.waitFor(
          (event) => event.event === 'whitelist-changed',
          3000,
          'whitelist-changed for classroom A'
        );
        const gotBPromise = clientB.waitFor(
          (event) => event.event === 'whitelist-changed',
          1500,
          'whitelist-changed for classroom B (should not receive)'
        );

        const parsedA = (await gotAPromise) as { event?: string; groupId?: string };
        assert.strictEqual(parsedA.event, 'whitelist-changed');
        assert.strictEqual(parsedA.groupId, overrideGroupId);

        await assert.rejects(gotBPromise, /should not receive/);
      } finally {
        if (notifyTimeoutId !== undefined) {
          clearTimeout(notifyTimeoutId);
        }
        clientA.close();
        clientB.close();
      }
    });
  });
});
