/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Setup & Settings Integration Tests
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import {
  getAvailablePort,
  trpcQuery,
  trpcMutate,
  parseTRPC,
  bearerAuth,
  assertStatus,
  resetDb,
  uniqueEmail,
} from '../test-utils.js';
import { closeConnection } from '../../src/db/index.js';

let PORT: number;
let API_URL: string;
const ADMIN_TOKEN = 'test-admin-token';

let server: Server | undefined;

void describe('Setup & Settings Integration', () => {
  beforeEach(async () => {
    await resetDb();

    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;

    const { app } = await import('../../src/server.js');

    server = app.listen(PORT);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterEach(async () => {
    if (server !== undefined) {
      server.close();
    }
    await closeConnection();
  });

  void test('should handle system setup flow', async () => {
    // 1. Initial status: should NOT be completed (resetDb only inserts user, not role)
    const statusResp = await trpcQuery(API_URL, 'setup.status');
    assertStatus(statusResp, 200);
    const { data: status } = (await parseTRPC(statusResp)) as {
      data: { hasAdmin: boolean; needsSetup: boolean };
    };
    assert.strictEqual(status.hasAdmin, false);
    assert.strictEqual(status.needsSetup, true);

    // 2. Create first admin
    const adminEmail = uniqueEmail('setup-admin');
    const createResp = await trpcMutate(API_URL, 'setup.createFirstAdmin', {
      email: adminEmail,
      name: 'Setup Admin',
      password: 'StrongPassword123',
    });
    assertStatus(createResp, 200);
    const { data: createData } = (await parseTRPC(createResp)) as {
      data: { registrationToken: string };
    };
    assert.ok(createData.registrationToken, 'Should return initial registration token');

    // 3. Verify status now completed
    const statusResp2 = await trpcQuery(API_URL, 'setup.status');
    const { data: status2 } = (await parseTRPC(statusResp2)) as {
      data: { hasAdmin: boolean; needsSetup: boolean };
    };
    assert.strictEqual(status2.hasAdmin, true);
    assert.strictEqual(status2.needsSetup, false);

    // 4. Manage tokens (as admin)
    // Use ADMIN_TOKEN (legacy fallback) to bypass auth for internal test management
    const getResp = await trpcQuery(
      API_URL,
      'setup.getRegistrationToken',
      undefined,
      bearerAuth(ADMIN_TOKEN)
    );
    assertStatus(getResp, 200);
    const { data: tokenData } = (await parseTRPC(getResp)) as {
      data: { registrationToken: string };
    };
    assert.ok(tokenData.registrationToken);

    // 5. Regenerate
    const regenResp = await trpcMutate(
      API_URL,
      'setup.regenerateToken',
      {},
      bearerAuth(ADMIN_TOKEN)
    );
    assertStatus(regenResp, 200);
    const { data: newTokenData } = (await parseTRPC(regenResp)) as {
      data: { registrationToken: string };
    };

    assert.notStrictEqual(tokenData.registrationToken, newTokenData.registrationToken);

    // 6. Validate
    const validResp = await trpcMutate(API_URL, 'setup.validateToken', {
      token: newTokenData.registrationToken,
    });
    assertStatus(validResp, 200);
    const { data: validation } = (await parseTRPC(validResp)) as { data: { valid: boolean } };
    assert.strictEqual(validation.valid, true);
  });
});
