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
import { closeConnection } from '../src/db/index.js';
import { generateMachineToken, hashMachineToken } from '../src/lib/machine-download-token.js';
import * as classroomStorage from '../src/lib/classroom-storage.js';

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

    await test('should reject requests with invalid token', async () => {
      const response = await fetch(`${API_URL}/api/machines/events?token=invalid-token`);
      assert.strictEqual(response.status, 403);
    });

    await test('should accept requests with valid machine token', async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 2000);

      try {
        const response = await fetch(`${API_URL}/api/machines/events?token=${testMachineToken}`, {
          signal: controller.signal,
        });

        assert.strictEqual(response.status, 200);

        const contentType = response.headers.get('content-type');
        assert.ok(
          contentType?.includes('text/event-stream'),
          `Expected text/event-stream, got ${String(contentType)}`
        );
      } catch (error) {
        // AbortError is expected — we're just checking headers
        if (error instanceof DOMException && error.name === 'AbortError') {
          // Expected — connection was aborted after header check
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
      const controller = new AbortController();

      const receivedEvents: string[] = [];

      const eventPromise = new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error('Timeout waiting for connected event'));
        }, 5000);

        void fetch(`${API_URL}/api/machines/events?token=${testMachineToken}`, {
          signal: controller.signal,
        })
          .then(async (response) => {
            assert.strictEqual(response.status, 200);

            const reader = response.body?.getReader();
            if (!reader) {
              reject(new Error('No reader available'));
              return;
            }

            const decoder = new TextDecoder();
            const readChunk = async (): Promise<void> => {
              const chunkUnknown: unknown = await reader.read();
              if (typeof chunkUnknown !== 'object' || chunkUnknown === null) {
                return;
              }

              if (!('done' in chunkUnknown) || !('value' in chunkUnknown)) {
                return;
              }

              const chunk = chunkUnknown as { done: boolean; value?: unknown };
              if (chunk.done) {
                return;
              }

              if (!(chunk.value instanceof Uint8Array)) {
                return;
              }

              const text = decoder.decode(chunk.value, { stream: true });
              for (const line of text.split('\n')) {
                if (line.startsWith('data: ')) {
                  receivedEvents.push(line.slice(6));
                }
              }

              // Check if we got the connected event
              for (const event of receivedEvents) {
                try {
                  const parsed = JSON.parse(event) as { event?: string };
                  if (parsed.event === 'connected') {
                    clearTimeout(timeoutId);
                    controller.abort();
                    resolve();
                    return;
                  }
                } catch {
                  // Not JSON yet, continue
                }
              }

              await readChunk();
            };

            await readChunk();
          })
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === 'AbortError') {
              // Expected when we abort after receiving the event
            } else {
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          });
      });

      await eventPromise;
      assert.ok(receivedEvents.length > 0, 'Should have received at least one event');

      const connectedEvent = JSON.parse(receivedEvents[0] ?? '{}') as {
        event?: string;
        groupId?: string;
      };
      assert.strictEqual(connectedEvent.event, 'connected');
      assert.strictEqual(connectedEvent.groupId, testGroupId);
    });
  });

  // =========================================================================
  // Real-time Event Tests
  // =========================================================================
  await describe('Real-time Events', async () => {
    await test('should receive whitelist-changed event when a rule is created', async () => {
      const controller = new AbortController();

      const eventPromise = new Promise<string[]>((resolve, reject) => {
        const receivedEvents: string[] = [];
        const timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error('Timeout waiting for whitelist-changed event'));
        }, 8000);

        void fetch(`${API_URL}/api/machines/events?token=${testMachineToken}`, {
          signal: controller.signal,
        })
          .then(async (response) => {
            const reader = response.body?.getReader();
            if (!reader) {
              reject(new Error('No reader available'));
              return;
            }

            const decoder = new TextDecoder();
            let gotConnected = false;

            const readChunk = async (): Promise<void> => {
              const chunkUnknown: unknown = await reader.read();
              if (typeof chunkUnknown !== 'object' || chunkUnknown === null) {
                return;
              }

              if (!('done' in chunkUnknown) || !('value' in chunkUnknown)) {
                return;
              }

              const chunk = chunkUnknown as { done: boolean; value?: unknown };
              if (chunk.done) {
                return;
              }

              if (!(chunk.value instanceof Uint8Array)) {
                return;
              }

              const text = decoder.decode(chunk.value, { stream: true });
              for (const line of text.split('\n')) {
                if (line.startsWith('data: ')) {
                  const payload = line.slice(6);
                  try {
                    const parsed = JSON.parse(payload) as { event?: string };

                    if (parsed.event === 'connected') {
                      gotConnected = true;
                      // Now that we're connected, create a rule to trigger an event
                      setTimeout(() => {
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
                    }

                    if (parsed.event === 'whitelist-changed' && gotConnected) {
                      clearTimeout(timeoutId);
                      receivedEvents.push(payload);
                      controller.abort();
                      resolve(receivedEvents);
                      return;
                    }
                  } catch {
                    // Not valid JSON, skip
                  }
                }
              }

              await readChunk();
            };

            await readChunk();
          })
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === 'AbortError') {
              // Expected
            } else {
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          });
      });

      const events = await eventPromise;
      assert.ok(events.length > 0, 'Should have received whitelist-changed event');

      const changeEvent = JSON.parse(events[0] ?? '{}') as {
        event?: string;
        groupId?: string;
      };
      assert.strictEqual(changeEvent.event, 'whitelist-changed');
      assert.strictEqual(changeEvent.groupId, testGroupId);
    });
  });
});
