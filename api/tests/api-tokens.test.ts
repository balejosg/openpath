/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Tests for API Tokens router
 *
 * Run with: npm run test:api-tokens
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import {
  getAvailablePort,
  trpcQuery,
  trpcMutate,
  parseTRPC,
  uniqueEmail,
  bearerAuth,
} from './test-utils.js';
import { closeConnection, db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

let PORT: number;
let API_URL: string;

// Global timeout - force exit if tests hang
const GLOBAL_TIMEOUT = setTimeout(() => {
  console.error('\n❌ API Tokens tests timed out! Forcing exit...');
  process.exit(1);
}, 30000);
GLOBAL_TIMEOUT.unref();

let server: Server | undefined;
let authToken: string | null = null;
const testEmail = uniqueEmail('tokens-test');
const testPassword = 'TestPassword123!';

// Response types
interface TokenListItem {
  id: string;
  name: string;
  maskedToken: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  isExpired: boolean;
}

interface TokenCreateResponse {
  id: string;
  name: string;
  token: string;
  expiresAt: string | null;
  createdAt: string;
}

interface TokenRevokeResponse {
  success: boolean;
  revokedAt: string;
}

interface AuthResult {
  accessToken: string;
  user: { id: string; email: string };
}

await describe('API Tokens Router Tests', { timeout: 30000 }, async () => {
  before(async () => {
    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);

    // Clean up test data (ignore errors if table doesn't exist yet)
    try {
      await db.execute(sql.raw("DELETE FROM api_tokens WHERE user_id LIKE '%tokens-test%'"));
    } catch {
      // Table may not exist yet, that's fine
    }
    try {
      await db.execute(sql.raw("DELETE FROM roles WHERE user_id LIKE '%tokens-test%'"));
    } catch {
      // Ignore
    }
    try {
      await db.execute(sql.raw("DELETE FROM users WHERE email LIKE '%tokens-test%'"));
    } catch {
      // Ignore
    }

    const { app } = await import('../src/server.js');

    server = app.listen(PORT, () => {
      console.log(`API Tokens test server started on port ${String(PORT)}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Register and login a test user
    const registerResponse = await trpcMutate(API_URL, 'auth.register', {
      email: testEmail,
      password: testPassword,
      name: 'Token Test User',
    });
    assert.strictEqual(registerResponse.status, 200, 'Registration should succeed');

    const loginResponse = await trpcMutate(API_URL, 'auth.login', {
      email: testEmail,
      password: testPassword,
    });
    assert.strictEqual(loginResponse.status, 200, 'Login should succeed');

    const { data: loginData } = (await parseTRPC(loginResponse)) as { data?: AuthResult };
    assert.ok(loginData?.accessToken, 'Should have access token');
    authToken = loginData.accessToken;
  });

  after(async () => {
    try {
      const { resetTokenStore } = await import('../src/lib/token-store.js');
      resetTokenStore();
    } catch (e) {
      console.error('Error resetting token store:', e);
    }

    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          console.log('API Tokens test server closed');
          resolve();
        });
      });
    }
    await closeConnection();
  });

  await describe('apiTokens.list', async () => {
    await test('should require authentication', async () => {
      const response = await trpcQuery(API_URL, 'apiTokens.list');
      assert.strictEqual(response.status, 401, 'Should require authentication');
    });

    await test('should return empty list for new user', async () => {
      const response = await trpcQuery(API_URL, 'apiTokens.list', undefined, bearerAuth(authToken));
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: TokenListItem[] };
      assert.ok(Array.isArray(data), 'Should return array');
      assert.strictEqual(data.length, 0, 'Should be empty initially');
    });
  });

  await describe('apiTokens.create', async () => {
    await test('should require authentication', async () => {
      const response = await trpcMutate(API_URL, 'apiTokens.create', { name: 'Test Token' });
      assert.strictEqual(response.status, 401, 'Should require authentication');
    });

    await test('should create token with name only', async () => {
      const response = await trpcMutate(
        API_URL,
        'apiTokens.create',
        { name: 'My API Token' },
        bearerAuth(authToken)
      );
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: TokenCreateResponse };
      assert.ok(data, 'Should return data');
      assert.ok(data.id.startsWith('tok_'), 'ID should have tok_ prefix');
      assert.strictEqual(data.name, 'My API Token');
      assert.ok(data.token.startsWith('op_'), 'Token should have op_ prefix');
      assert.ok(data.token.length > 40, 'Token should be long enough');
      assert.strictEqual(data.expiresAt, null, 'Should not expire by default');
    });

    await test('should create token with expiration', async () => {
      const response = await trpcMutate(
        API_URL,
        'apiTokens.create',
        { name: 'Expiring Token', expiresInDays: 30 },
        bearerAuth(authToken)
      );
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: TokenCreateResponse };
      assert.ok(data, 'Should return data');
      assert.ok(data.expiresAt, 'Should have expiration date');

      const expiresAt = new Date(data.expiresAt);
      const now = new Date();
      const diffDays = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      assert.ok(diffDays >= 29 && diffDays <= 31, 'Should expire in ~30 days');
    });

    await test('should reject empty name', async () => {
      const response = await trpcMutate(
        API_URL,
        'apiTokens.create',
        { name: '' },
        bearerAuth(authToken)
      );
      assert.strictEqual(response.status, 400, 'Should reject empty name');
    });

    await test('should reject name too long', async () => {
      const response = await trpcMutate(
        API_URL,
        'apiTokens.create',
        { name: 'x'.repeat(101) },
        bearerAuth(authToken)
      );
      assert.strictEqual(response.status, 400, 'Should reject long name');
    });
  });

  await describe('apiTokens.list after creation', async () => {
    await test('should list created tokens', async () => {
      const response = await trpcQuery(API_URL, 'apiTokens.list', undefined, bearerAuth(authToken));
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: TokenListItem[] };
      assert.ok(Array.isArray(data), 'Should return array');
      assert.ok(data.length >= 2, 'Should have at least 2 tokens');

      // Check token structure
      const token = data[0];
      assert.ok(token, 'Should have at least one token');
      assert.ok(token.id.startsWith('tok_'), 'ID should have tok_ prefix');
      assert.ok(token.maskedToken.startsWith('op_'), 'Masked token should have op_ prefix');
      assert.ok(token.maskedToken.includes('•'), 'Masked token should have dots');
      assert.ok(token.createdAt, 'Should have createdAt');
    });
  });

  await describe('apiTokens.revoke', async () => {
    let tokenToRevoke: string;

    before(async () => {
      // Create a token to revoke
      const response = await trpcMutate(
        API_URL,
        'apiTokens.create',
        { name: 'Token to Revoke' },
        bearerAuth(authToken)
      );
      const { data } = (await parseTRPC(response)) as { data?: TokenCreateResponse };
      assert.ok(data, 'Should create token');
      tokenToRevoke = data.id;
    });

    await test('should require authentication', async () => {
      const response = await trpcMutate(API_URL, 'apiTokens.revoke', { id: tokenToRevoke });
      assert.strictEqual(response.status, 401, 'Should require authentication');
    });

    await test('should revoke own token', async () => {
      const response = await trpcMutate(
        API_URL,
        'apiTokens.revoke',
        { id: tokenToRevoke },
        bearerAuth(authToken)
      );
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: TokenRevokeResponse };
      assert.ok(data, 'Should return data');
      assert.strictEqual(data.success, true);
      assert.ok(data.revokedAt, 'Should have revokedAt timestamp');
    });

    await test('should not find revoked token in list', async () => {
      const response = await trpcQuery(API_URL, 'apiTokens.list', undefined, bearerAuth(authToken));
      const { data } = (await parseTRPC(response)) as { data?: TokenListItem[] };
      assert.ok(Array.isArray(data), 'Should return array');

      const found = data.find((t) => t.id === tokenToRevoke);
      assert.strictEqual(found, undefined, 'Revoked token should not be in list');
    });

    await test('should reject revoking non-existent token', async () => {
      const response = await trpcMutate(
        API_URL,
        'apiTokens.revoke',
        { id: 'tok_nonexistent' },
        bearerAuth(authToken)
      );
      assert.strictEqual(response.status, 404, 'Should return 404');
    });

    await test('should reject revoking already revoked token', async () => {
      const response = await trpcMutate(
        API_URL,
        'apiTokens.revoke',
        { id: tokenToRevoke },
        bearerAuth(authToken)
      );
      assert.strictEqual(response.status, 404, 'Should return 404 for already revoked');
    });
  });

  await describe('apiTokens.regenerate', async () => {
    let tokenToRegenerate: string;
    let originalTokenValue: string;

    before(async () => {
      // Create a token to regenerate
      const response = await trpcMutate(
        API_URL,
        'apiTokens.create',
        { name: 'Token to Regenerate' },
        bearerAuth(authToken)
      );
      const { data } = (await parseTRPC(response)) as { data?: TokenCreateResponse };
      assert.ok(data, 'Should create token');
      tokenToRegenerate = data.id;
      originalTokenValue = data.token;
    });

    await test('should require authentication', async () => {
      const response = await trpcMutate(API_URL, 'apiTokens.regenerate', { id: tokenToRegenerate });
      assert.strictEqual(response.status, 401, 'Should require authentication');
    });

    await test('should regenerate token with new value', async () => {
      const response = await trpcMutate(
        API_URL,
        'apiTokens.regenerate',
        { id: tokenToRegenerate },
        bearerAuth(authToken)
      );
      assert.strictEqual(response.status, 200);

      const { data } = (await parseTRPC(response)) as { data?: TokenCreateResponse };
      assert.ok(data, 'Should return data');
      assert.ok(data.id.startsWith('tok_'), 'New ID should have tok_ prefix');
      assert.notStrictEqual(data.id, tokenToRegenerate, 'Should have new ID');
      assert.strictEqual(data.name, 'Token to Regenerate', 'Should keep same name');
      assert.ok(data.token.startsWith('op_'), 'New token should have op_ prefix');
      assert.notStrictEqual(data.token, originalTokenValue, 'Should have different token value');
    });

    await test('should not find old token after regeneration', async () => {
      const response = await trpcQuery(API_URL, 'apiTokens.list', undefined, bearerAuth(authToken));
      const { data } = (await parseTRPC(response)) as { data?: TokenListItem[] };
      assert.ok(Array.isArray(data), 'Should return array');

      const found = data.find((t) => t.id === tokenToRegenerate);
      assert.strictEqual(found, undefined, 'Old token should not be in list');
    });
  });
});
