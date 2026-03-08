import assert from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';

const ORIGINAL_ENV = {
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY,
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  restoreEnv();
});

function restoreEnv(): void {
  restoreEnvVar('JWT_SECRET', ORIGINAL_ENV.JWT_SECRET);
  restoreEnvVar('JWT_ACCESS_EXPIRY', ORIGINAL_ENV.JWT_ACCESS_EXPIRY);
  restoreEnvVar('JWT_REFRESH_EXPIRY', ORIGINAL_ENV.JWT_REFRESH_EXPIRY);
  restoreEnvVar('JWT_EXPIRES_IN', ORIGINAL_ENV.JWT_EXPIRES_IN);
  restoreEnvVar('JWT_REFRESH_EXPIRES_IN', ORIGINAL_ENV.JWT_REFRESH_EXPIRES_IN);
  restoreEnvVar('NODE_ENV', ORIGINAL_ENV.NODE_ENV);
}

function restoreEnvVar(
  name:
    | 'JWT_SECRET'
    | 'JWT_ACCESS_EXPIRY'
    | 'JWT_REFRESH_EXPIRY'
    | 'JWT_EXPIRES_IN'
    | 'JWT_REFRESH_EXPIRES_IN'
    | 'NODE_ENV',
  value: string | undefined
): void {
  if (value !== undefined) {
    process.env[name] = value;
    return;
  }

  switch (name) {
    case 'JWT_SECRET':
      delete process.env.JWT_SECRET;
      break;
    case 'JWT_ACCESS_EXPIRY':
      delete process.env.JWT_ACCESS_EXPIRY;
      break;
    case 'JWT_REFRESH_EXPIRY':
      delete process.env.JWT_REFRESH_EXPIRY;
      break;
    case 'JWT_EXPIRES_IN':
      delete process.env.JWT_EXPIRES_IN;
      break;
    case 'JWT_REFRESH_EXPIRES_IN':
      delete process.env.JWT_REFRESH_EXPIRES_IN;
      break;
    case 'NODE_ENV':
      delete process.env.NODE_ENV;
      break;
  }
}

function assertTokenLifetime(
  token: string,
  secret: string,
  expectedType: 'access' | 'refresh',
  expectedSeconds: number
): void {
  const payload = jwt.verify(token, secret, {
    issuer: 'openpath-api',
  }) as jwt.JwtPayload & { type?: unknown };

  assert.strictEqual(typeof payload, 'object');
  assert.strictEqual(payload.type, expectedType);
  assert.strictEqual(typeof payload.iat, 'number');
  assert.strictEqual(typeof payload.exp, 'number');

  const issuedAt = payload.iat;
  const expiresAt = payload.exp;
  if (issuedAt === undefined || expiresAt === undefined) {
    assert.fail(`Missing iat/exp in ${expectedType} token`);
  }

  const actualSeconds = expiresAt - issuedAt;
  assert.ok(
    Math.abs(actualSeconds - expectedSeconds) <= 1,
    `Expected ${expectedType} lifetime near ${String(expectedSeconds)}s, got ${String(actualSeconds)}s`
  );
}

await describe('token expiry configuration', async () => {
  await it('uses JWT_ACCESS_EXPIRY and JWT_REFRESH_EXPIRY for signed token lifetimes', async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'task5-openpath-secret';
    process.env.JWT_ACCESS_EXPIRY = '17m';
    process.env.JWT_REFRESH_EXPIRY = '9d';
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.JWT_REFRESH_EXPIRES_IN;

    const tag = ['task5-openpath', String(Date.now()), Math.random().toString(16).slice(2)].join(
      '-'
    );

    const { config } = (await import(
      `../src/config.ts?${tag}`
    )) as typeof import('../src/config.js');
    const { generateTokens } = (await import(
      `../src/lib/auth.ts?${tag}`
    )) as typeof import('../src/lib/auth.js');

    assert.strictEqual(config.jwtAccessExpiry, '17m');
    assert.strictEqual(config.jwtRefreshExpiry, '9d');

    const tokens = generateTokens(
      {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User Example',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
      },
      []
    );

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      assert.fail('JWT_SECRET should be set for the test');
    }

    assert.strictEqual(tokens.expiresIn, '17m');
    assertTokenLifetime(tokens.accessToken, jwtSecret, 'access', 17 * 60);
    assertTokenLifetime(tokens.refreshToken, jwtSecret, 'refresh', 9 * 24 * 60 * 60);
  });
});
