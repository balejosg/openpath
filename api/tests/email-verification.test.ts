import { after, before, describe, test } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';

import {
  getAvailablePort,
  parseTRPC,
  registerAndVerifyUser,
  resetDb,
  trpcMutate as _trpcMutate,
  uniqueEmail,
} from './test-utils.js';
import { closeConnection } from '../src/db/index.js';
import AuthService from '../src/services/auth.service.js';

let PORT: number;
let API_URL: string;
let server: Server | undefined;

const trpcMutate = (
  procedure: string,
  input: unknown,
  headers: Record<string, string> = {}
): Promise<Response> => _trpcMutate(API_URL, procedure, input, headers);

void describe('Email verification primitives', { timeout: 30000 }, () => {
  before(async () => {
    await resetDb();
    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);

    const { app } = await import('../src/server.js');
    server = app.listen(PORT);
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  after(async () => {
    if (server !== undefined) {
      server.close();
    }
    await closeConnection();
  });

  void test('register requires verification but does not expose verification secrets publicly', async () => {
    const email = uniqueEmail('verify-login');
    const password = 'SecurePassword123!';

    const registerResponse = await trpcMutate('auth.register', {
      email,
      password,
      name: 'Verification User',
    });

    assert.strictEqual(registerResponse.status, 200);
    const { data } = (await parseTRPC(registerResponse)) as {
      data?: { verificationRequired?: boolean; verificationToken?: string };
    };
    assert.ok(data);
    assert.strictEqual(data.verificationRequired, true);
    assert.strictEqual(data.verificationToken, undefined);

    const loginResponse = await trpcMutate('auth.login', {
      email,
      password,
    });
    assert.strictEqual(loginResponse.status, 403);

    const loginError = await parseTRPC(loginResponse);
    assert.match(loginError.error ?? '', /verification/i);
  });

  void test('public generateEmailVerificationToken no longer exposes issuance', async () => {
    const email = uniqueEmail('verify-resend');
    const password = 'SecurePassword123!';

    const registerResponse = await trpcMutate('auth.register', {
      email,
      password,
      name: 'Resend Verification User',
    });
    assert.strictEqual(registerResponse.status, 200);

    const generatedResponse = await trpcMutate('auth.generateEmailVerificationToken', { email });
    assert.strictEqual(generatedResponse.status, 401);
  });

  void test('internal verification issuance still works for an existing unverified user', async () => {
    const email = uniqueEmail('verify-resend-internal');
    const password = 'SecurePassword123!';

    const registerResponse = await trpcMutate('auth.register', {
      email,
      password,
      name: 'Resend Verification User',
    });
    assert.strictEqual(registerResponse.status, 200);

    const generatedResponse = await AuthService.generateEmailVerificationToken(email);
    if (!generatedResponse.ok) {
      throw new Error('Expected internal verification issuance to succeed');
    }

    assert.strictEqual(generatedResponse.data.email, email);
    assert.strictEqual(generatedResponse.data.verificationRequired, true);
    assert.ok(generatedResponse.data.verificationToken);
    assert.ok(generatedResponse.data.verificationExpiresAt);
  });

  void test('verifyEmail marks the user as verified and unlocks login', async () => {
    const email = uniqueEmail('verify-complete');
    const password = 'SecurePassword123!';

    const { registerResponse, registerData, verifyResponse } = await registerAndVerifyUser(
      API_URL,
      {
        email,
        password,
        name: 'Complete Verification User',
      }
    );

    assert.strictEqual(registerResponse.status, 200);
    assert.ok(registerData);
    assert.ok(verifyResponse);
    assert.strictEqual(verifyResponse.status, 200);

    const loginResponse = await trpcMutate('auth.login', {
      email,
      password,
    });
    assert.strictEqual(loginResponse.status, 200);

    const { data } = (await parseTRPC(loginResponse)) as {
      data?: { accessToken?: string };
    };
    assert.ok(data);
    assert.ok(data.accessToken);
  });
});
