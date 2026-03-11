/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Tests for removal of the API token product surface
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';

import { closeConnection } from '../src/db/index.js';
import * as userStorage from '../src/lib/user-storage.js';
import {
  bearerAuth,
  getAvailablePort,
  parseTRPC,
  resetDb,
  trpcMutate,
  trpcQuery,
  uniqueEmail,
} from './test-utils.js';

let PORT: number;
let API_URL: string;
let server: Server | undefined;
let authToken: string | null = null;

const GLOBAL_TIMEOUT = setTimeout(() => {
  console.error('\n❌ API token removal tests timed out! Forcing exit...');
  process.exit(1);
}, 30000);
GLOBAL_TIMEOUT.unref();

void describe('API token surface removal', { timeout: 30000 }, () => {
  before(async () => {
    await resetDb();

    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);

    const { app } = await import('../src/server.js');
    server = app.listen(PORT);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const email = uniqueEmail('tokens-removed');
    const password = 'SecurePassword123!';

    await userStorage.createUser(
      {
        email,
        password,
        name: 'Removed Token Surface User',
      },
      { emailVerified: true }
    );

    const loginResponse = await trpcMutate(API_URL, 'auth.login', { email, password });
    assert.strictEqual(loginResponse.status, 200);

    const { data } = (await parseTRPC(loginResponse)) as { data?: { accessToken?: string } };
    assert.ok(data?.accessToken);
    authToken = data.accessToken;
  });

  after(async () => {
    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          resolve();
        });
      });
    }

    await closeConnection();
  });

  void test('keeps unauthenticated callers out of removed procedures', async () => {
    const response = await trpcQuery(API_URL, 'apiTokens.list');
    assert.strictEqual(response.status, 401);
  });

  void test('removes apiTokens.list for authenticated users', async () => {
    const response = await trpcQuery(API_URL, 'apiTokens.list', undefined, bearerAuth(authToken));
    assert.strictEqual(response.status, 404);
  });

  void test('removes apiTokens.create for authenticated users', async () => {
    const response = await trpcMutate(
      API_URL,
      'apiTokens.create',
      { name: 'legacy token' },
      bearerAuth(authToken)
    );
    assert.strictEqual(response.status, 404);
  });

  void test('removes apiTokens.revoke for authenticated users', async () => {
    const response = await trpcMutate(
      API_URL,
      'apiTokens.revoke',
      { id: 'tok_legacy' },
      bearerAuth(authToken)
    );
    assert.strictEqual(response.status, 404);
  });

  void test('removes apiTokens.regenerate for authenticated users', async () => {
    const response = await trpcMutate(
      API_URL,
      'apiTokens.regenerate',
      { id: 'tok_legacy' },
      bearerAuth(authToken)
    );
    assert.strictEqual(response.status, 404);
  });
});
