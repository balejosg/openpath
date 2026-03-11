import { after, afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert';

import { OAuth2Client, type LoginTicket } from 'google-auth-library';
import { eq, sql } from 'drizzle-orm';

import * as authLib from '../src/lib/auth.js';
import * as roleStorage from '../src/lib/role-storage.js';
import * as userStorage from '../src/lib/user-storage.js';
import * as authService from '../src/services/auth.service.js';
import * as setupService from '../src/services/setup.service.js';
import * as userService from '../src/services/user.service.js';
import { config } from '../src/config.js';
import { closeConnection, db, users } from '../src/db/index.js';
import { resetDb, uniqueEmail } from './test-utils.js';

const DEFAULT_PASSWORD = 'SecurePassword123!';
const originalGoogleClientId = config.googleClientId;
const originalVerifyIdToken = Reflect.get(OAuth2Client.prototype, 'verifyIdToken');

interface GooglePayload {
  email?: string;
  sub?: string;
  name?: string;
}

function stubGooglePayload(payload: GooglePayload): void {
  const ticket = {
    getPayload: () => payload,
  } as unknown as LoginTicket;

  OAuth2Client.prototype.verifyIdToken = (() =>
    Promise.resolve(ticket)) as unknown as OAuth2Client['verifyIdToken'];
}

function stubGoogleError(message: string): void {
  OAuth2Client.prototype.verifyIdToken = ((): never => {
    throw new Error(message);
  }) as unknown as OAuth2Client['verifyIdToken'];
}

async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, userId));
}

function setGoogleClientId(value: string): void {
  Object.defineProperty(config, 'googleClientId', {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

afterEach(() => {
  setGoogleClientId(originalGoogleClientId);
  OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
});

after(async () => {
  await closeConnection();
});

void describe('Coverage-oriented service and storage tests', { concurrency: false }, () => {
  beforeEach(async () => {
    await resetDb();
  });

  void test('loads the storage types module at runtime', async () => {
    const storageTypesModule = await import('../src/types/storage.js');
    assert.strictEqual(typeof storageTypesModule, 'object');
  });

  void describe('userStorage', { concurrency: false }, () => {
    void test('covers lookup helpers, Google linking, verification, and stats', async () => {
      const primaryEmail = uniqueEmail('storage-primary');
      const googleEmail = uniqueEmail('storage-google');
      const primary = await userStorage.createUser({
        email: primaryEmail,
        name: 'Primary User',
        password: DEFAULT_PASSWORD,
      });
      const googleUser = await userStorage.createGoogleUser({
        email: googleEmail,
        name: 'Google User',
        googleId: 'google-sub-created',
      });

      const allUsers = await userStorage.getAllUsers();
      assert.ok(allUsers.some((user) => user.id === primary.id));
      assert.ok(allUsers.some((user) => user.id === googleUser.id));

      assert.strictEqual(await userStorage.linkGoogleId(primary.id, 'google-sub-linked'), true);
      const linkedUser = await userStorage.getUserByGoogleId('google-sub-linked');
      assert.ok(linkedUser);
      assert.strictEqual(linkedUser.id, primary.id);

      assert.strictEqual(await userStorage.verifyEmail(primary.id), true);
      assert.strictEqual(await userStorage.verifyEmail('missing-user-id'), false);
      assert.strictEqual(await userStorage.deleteUser('missing-user-id'), false);

      await userStorage.updateLastLogin(primary.id);

      const stats = await userStorage.getStats();
      assert.strictEqual(stats.total, 3);
      assert.strictEqual(stats.active, 3);
      assert.strictEqual(stats.verified, 2);

      assert.strictEqual(await userStorage.getUserById('missing-user-id'), null);
    });

    void test('covers update, password verification, and delete flows', async () => {
      const email = uniqueEmail('storage-update');
      const created = await userStorage.createUser({
        email,
        name: '  Before Update  ',
        password: DEFAULT_PASSWORD,
      });

      const unchanged = await userStorage.updateUser(created.id, {});
      assert.ok(unchanged);
      assert.strictEqual(unchanged.email, email);

      const updatedEmail = `  ${uniqueEmail('storage-updated').toUpperCase()}  `;
      const updated = await userStorage.updateUser(created.id, {
        email: updatedEmail,
        name: '  Updated User  ',
        password: 'NewPassword123!',
      });

      assert.ok(updated);
      assert.strictEqual(updated.email, updatedEmail.toLowerCase().trim());
      assert.strictEqual(updated.name, 'Updated User');

      const fullUser = await userStorage.getUserByEmail(updated.email);
      assert.ok(fullUser);
      assert.strictEqual(await userStorage.verifyPassword(fullUser, 'NewPassword123!'), true);
      assert.strictEqual(await userStorage.verifyPassword(fullUser, 'WrongPassword123!'), false);
      assert.strictEqual(
        await userStorage.verifyPasswordByEmail(updated.email, 'WrongPassword123!'),
        null
      );

      const verifiedByEmail = await userStorage.verifyPasswordByEmail(
        updated.email,
        'NewPassword123!'
      );
      assert.ok(verifiedByEmail);
      assert.strictEqual(verifiedByEmail.email, updated.email);

      assert.strictEqual(await userStorage.deleteUser(created.id), true);
      assert.strictEqual(await userStorage.getUserById(created.id), null);
    });
  });

  void describe('setupService', { concurrency: false }, () => {
    void test('validates first-admin input before setup completes', async () => {
      const duplicateEmail = uniqueEmail('setup-duplicate');
      await userStorage.createUser({
        email: duplicateEmail,
        name: 'Existing User',
        password: DEFAULT_PASSWORD,
      });

      const invalidEmail = await setupService.createFirstAdmin({
        email: 'invalid-email',
        name: 'Setup Admin',
        password: DEFAULT_PASSWORD,
      });
      assert.deepStrictEqual(invalidEmail, {
        ok: false,
        error: { code: 'INVALID_INPUT', message: 'Invalid email address', field: 'email' },
      });

      const blankName = await setupService.createFirstAdmin({
        email: uniqueEmail('setup-blank-name'),
        name: '   ',
        password: DEFAULT_PASSWORD,
      });
      assert.deepStrictEqual(blankName, {
        ok: false,
        error: { code: 'INVALID_INPUT', message: 'Name is required', field: 'name' },
      });

      const shortPassword = await setupService.createFirstAdmin({
        email: uniqueEmail('setup-short-password'),
        name: 'Setup Admin',
        password: 'short',
      });
      assert.deepStrictEqual(shortPassword, {
        ok: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Password must be at least 8 characters',
          field: 'password',
        },
      });

      const duplicateEmailResult = await setupService.createFirstAdmin({
        email: duplicateEmail,
        name: 'Setup Admin',
        password: DEFAULT_PASSWORD,
      });
      assert.deepStrictEqual(duplicateEmailResult, {
        ok: false,
        error: { code: 'EMAIL_EXISTS', message: 'Email already registered' },
      });

      assert.deepStrictEqual(await setupService.validateToken('   '), { valid: false });

      const tokenBeforeSetup = await setupService.getRegistrationToken();
      assert.deepStrictEqual(tokenBeforeSetup, {
        ok: false,
        error: { code: 'SETUP_NOT_COMPLETED', message: 'Setup not completed' },
      });

      const regenerateBeforeSetup = await setupService.regenerateToken();
      assert.deepStrictEqual(regenerateBeforeSetup, {
        ok: false,
        error: { code: 'SETUP_NOT_COMPLETED', message: 'Setup not completed' },
      });
    });

    void test('completes the setup lifecycle and rotates registration tokens', async () => {
      const beforeStatus = await setupService.getStatus();
      assert.deepStrictEqual(beforeStatus, { needsSetup: true, hasAdmin: false });

      const created = await setupService.createFirstAdmin({
        email: uniqueEmail('setup-admin'),
        name: 'First Admin',
        password: DEFAULT_PASSWORD,
      });
      if (!created.ok) {
        throw new Error('Expected setup to succeed');
      }

      const storedAdmin = await userStorage.getUserByEmail(created.data.user.email);
      assert.ok(storedAdmin);
      assert.strictEqual(storedAdmin.emailVerified, true);

      const afterStatus = await setupService.getStatus();
      assert.deepStrictEqual(afterStatus, { needsSetup: false, hasAdmin: true });

      const tokenValidation = await setupService.validateToken(created.data.registrationToken);
      assert.deepStrictEqual(tokenValidation, { valid: true });

      const existingToken = await setupService.getRegistrationToken();
      if (!existingToken.ok) {
        throw new Error('Expected registration token to exist');
      }
      assert.strictEqual(existingToken.data.registrationToken, created.data.registrationToken);

      const rotatedToken = await setupService.regenerateToken();
      if (!rotatedToken.ok) {
        throw new Error('Expected token regeneration to succeed');
      }
      assert.notStrictEqual(rotatedToken.data.registrationToken, created.data.registrationToken);

      const secondAdmin = await setupService.createFirstAdmin({
        email: uniqueEmail('setup-second-admin'),
        name: 'Second Admin',
        password: DEFAULT_PASSWORD,
      });
      assert.deepStrictEqual(secondAdmin, {
        ok: false,
        error: { code: 'SETUP_ALREADY_COMPLETED', message: 'Setup already completed' },
      });
    });
  });

  void describe('userService', { concurrency: false }, () => {
    void test('manages users and roles through the service layer', async () => {
      const registered = await userService.register({
        email: uniqueEmail('service-register'),
        name: 'Service User',
        password: DEFAULT_PASSWORD,
      });
      if (!registered.ok) {
        throw new Error('Expected userService.register to succeed');
      }

      const userId = registered.data.user.id;

      const assigned = await userService.assignRole(userId, 'teacher', ['group-a']);
      if (!assigned.ok) {
        throw new Error('Expected role assignment to succeed');
      }

      const listed = await userService.listUsers();
      const listedUser = listed.find((user) => user.id === userId);
      assert.ok(listedUser);
      assert.strictEqual(listedUser.roles[0]?.role, 'teacher');

      const fetched = await userService.getUser(userId);
      if (!fetched.ok) {
        throw new Error('Expected getUser to succeed');
      }
      assert.strictEqual(fetched.data.emailVerified, true);

      const updated = await userService.updateUser(userId, { name: 'Updated Service User' });
      if (!updated.ok) {
        throw new Error('Expected updateUser to succeed');
      }
      assert.strictEqual(updated.data.name, 'Updated Service User');

      const revoked = await userService.revokeRole(assigned.data.id);
      assert.deepStrictEqual(revoked, { ok: true, data: { success: true } });

      const deleted = await userService.deleteUser(userId);
      assert.deepStrictEqual(deleted, { ok: true, data: { success: true } });
    });

    void test('returns not-found and bad-request errors when appropriate', async () => {
      assert.deepStrictEqual(await userService.getUser('missing-user-id'), {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
      assert.deepStrictEqual(await userService.updateUser('missing-user-id', { name: 'Missing' }), {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
      assert.deepStrictEqual(await userService.deleteUser('missing-user-id'), {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
      assert.deepStrictEqual(await userService.assignRole('missing-user-id', 'teacher', []), {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
      assert.deepStrictEqual(await userService.revokeRole('missing-role-id'), {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Role not found' },
      });

      const firstEmail = uniqueEmail('service-existing');
      const secondEmail = uniqueEmail('service-second');
      const firstUser = await userStorage.createUser({
        email: firstEmail,
        name: 'First User',
        password: DEFAULT_PASSWORD,
      });
      const secondUser = await userStorage.createUser({
        email: secondEmail,
        name: 'Second User',
        password: DEFAULT_PASSWORD,
      });

      const duplicateUpdate = await userService.updateUser(secondUser.id, {
        email: firstUser.email,
      });
      if (duplicateUpdate.ok) {
        throw new Error('Expected duplicate update to fail');
      }
      assert.strictEqual(duplicateUpdate.error.code, 'BAD_REQUEST');

      const duplicateRegister = await userService.register({
        email: firstUser.email,
        name: 'Duplicate User',
        password: DEFAULT_PASSWORD,
      });
      if (duplicateRegister.ok) {
        throw new Error('Expected duplicate register to fail');
      }
      assert.strictEqual(duplicateRegister.error.code, 'BAD_REQUEST');
    });
  });

  void describe('authService', { concurrency: false }, () => {
    void test('registers users, verifies email, refreshes tokens, and returns profiles', async () => {
      const email = uniqueEmail('auth-flow');
      const registerResult = await authService.register({
        email,
        name: 'Auth Flow User',
        password: DEFAULT_PASSWORD,
      });
      if (!registerResult.ok) {
        throw new Error('Expected authService.register to succeed');
      }
      assert.strictEqual(registerResult.data.user.emailVerified, false);
      assert.ok(registerResult.data.verificationToken);

      const blockedLogin = await authService.login(email, DEFAULT_PASSWORD);
      assert.deepStrictEqual(blockedLogin, {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: authService.EMAIL_VERIFICATION_REQUIRED_MESSAGE,
        },
      });

      const missingProfile = await authService.getProfile('missing-user-id');
      assert.deepStrictEqual(missingProfile, {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });

      const missingVerify = await authService.verifyEmail(
        uniqueEmail('auth-missing'),
        'missing-token'
      );
      assert.deepStrictEqual(missingVerify, {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });

      const invalidVerify = await authService.verifyEmail(email, 'wrong-token');
      assert.deepStrictEqual(invalidVerify, {
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid or expired verification token' },
      });

      const verified = await authService.verifyEmail(email, registerResult.data.verificationToken);
      assert.deepStrictEqual(verified, { ok: true, data: { success: true } });

      const alreadyVerified = await authService.verifyEmail(
        email,
        registerResult.data.verificationToken
      );
      assert.deepStrictEqual(alreadyVerified, { ok: true, data: { success: true } });

      const loginResult = await authService.login(email, DEFAULT_PASSWORD);
      if (!loginResult.ok) {
        throw new Error('Expected authService.login to succeed after verification');
      }

      const refreshResult = await authService.refresh(loginResult.data.refreshToken);
      assert.ok(refreshResult.ok);

      const userProfile = await authService.getProfile(loginResult.data.user.id);
      if (!userProfile.ok) {
        throw new Error('Expected profile lookup to succeed');
      }
      assert.strictEqual(userProfile.data.user.emailVerified, true);

      const resendResult = await authService.generateEmailVerificationToken(email);
      assert.deepStrictEqual(resendResult, {
        ok: false,
        error: { code: 'CONFLICT', message: 'Email is already verified' },
      });
    });

    void test('handles reset-password and change-password edge cases', async () => {
      const email = uniqueEmail('auth-passwords');
      const created = await userStorage.createUser(
        {
          email,
          name: 'Password User',
          password: DEFAULT_PASSWORD,
        },
        { emailVerified: true }
      );

      const missingResetToken = await authService.generateResetToken(
        uniqueEmail('auth-missing-reset')
      );
      assert.deepStrictEqual(missingResetToken, {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });

      const resetToken = await authService.generateResetToken(email);
      if (!resetToken.ok) {
        throw new Error('Expected reset token generation to succeed');
      }

      const invalidReset = await authService.resetPassword(
        email,
        'wrong-reset-token',
        'NextPassword123!'
      );
      assert.deepStrictEqual(invalidReset, {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      });

      const validReset = await authService.resetPassword(
        email,
        resetToken.data.token,
        'NextPassword123!'
      );
      assert.deepStrictEqual(validReset, { ok: true, data: { success: true } });

      const missingPasswordInput = await authService.changePassword(
        created.id,
        '',
        'AnotherPass123!'
      );
      assert.deepStrictEqual(missingPasswordInput, {
        ok: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Current and new password are required',
        },
      });

      const shortPassword = await authService.changePassword(
        created.id,
        'NextPassword123!',
        'short'
      );
      assert.deepStrictEqual(shortPassword, {
        ok: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'New password must be at least 8 characters',
        },
      });

      const missingUser = await authService.changePassword(
        'missing-user-id',
        'NextPassword123!',
        'AnotherPass123!'
      );
      assert.deepStrictEqual(missingUser, {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });

      const wrongCurrentPassword = await authService.changePassword(
        created.id,
        'WrongPassword123!',
        'AnotherPass123!'
      );
      assert.deepStrictEqual(wrongCurrentPassword, {
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Current password is incorrect' },
      });

      const validChange = await authService.changePassword(
        created.id,
        'NextPassword123!',
        'AnotherPass123!'
      );
      assert.deepStrictEqual(validChange, { ok: true, data: { success: true } });

      const loginWithChangedPassword = await authService.login(email, 'AnotherPass123!');
      assert.ok(loginWithChangedPassword.ok);
    });

    void test('returns unauthorized when password persistence fails unexpectedly', async () => {
      const email = uniqueEmail('auth-password-trigger');
      const created = await userStorage.createUser(
        {
          email,
          name: 'Trigger Password User',
          password: DEFAULT_PASSWORD,
        },
        { emailVerified: true }
      );

      const triggerName = `change_password_fail_${String(Date.now())}`;
      const functionName = `${triggerName}_fn`;

      try {
        await db.execute(
          sql.raw(`
            CREATE OR REPLACE FUNCTION ${functionName}()
            RETURNS trigger AS $$
            BEGIN
              IF NEW.id = '${created.id}' THEN
                RAISE EXCEPTION 'forced password update failure';
              END IF;
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
          `)
        );
        await db.execute(
          sql.raw(`
            CREATE TRIGGER ${triggerName}
            BEFORE UPDATE ON users
            FOR EACH ROW
            EXECUTE FUNCTION ${functionName}();
          `)
        );

        const result = await authService.changePassword(
          created.id,
          DEFAULT_PASSWORD,
          'AnotherPass123!'
        );
        assert.equal(result.ok, false);
        if (result.ok) {
          throw new Error('Expected password change failure');
        }
        assert.deepStrictEqual(result.error.code, 'UNAUTHORIZED');
        assert.match(result.error.message, /^Failed query: update "users" set "password_hash"/);
      } finally {
        await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON users;`));
        await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${functionName}();`));
      }
    });

    void test('generates verification tokens for unverified users and blocks refresh until verified', async () => {
      const missingEmail = await authService.generateEmailVerificationToken(
        uniqueEmail('auth-missing')
      );
      assert.deepStrictEqual(missingEmail, {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });

      const email = uniqueEmail('auth-refresh-block');
      await userStorage.createUser({
        email,
        name: 'Refresh Block User',
        password: DEFAULT_PASSWORD,
      });

      const verificationToken = await authService.generateEmailVerificationToken(email);
      assert.ok(verificationToken.ok);

      const fullUser = await userStorage.getUserByEmail(email);
      assert.ok(fullUser);

      const tokens = authLib.generateTokens(fullUser, []);
      const refreshResult = await authService.refresh(tokens.refreshToken);
      assert.deepStrictEqual(refreshResult, {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: authService.EMAIL_VERIFICATION_REQUIRED_MESSAGE,
        },
      });
    });

    void test('covers Google login branches for config, payload, linking, unknown accounts, inactivity, and timeouts', async () => {
      const missingConfig = await authService.loginWithGoogle('token-without-config');
      assert.deepStrictEqual(missingConfig, {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Google OAuth not configured' },
      });

      setGoogleClientId('test-google-client-id');

      stubGooglePayload({ sub: 'missing-email-sub' });
      const invalidPayload = await authService.loginWithGoogle('invalid-payload-token');
      assert.deepStrictEqual(invalidPayload, {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid Google token' },
      });

      const existingEmail = uniqueEmail('google-link-existing');
      const existingUser = await userStorage.createUser({
        email: existingEmail,
        name: 'Existing Google User',
        password: DEFAULT_PASSWORD,
      });
      await roleStorage.assignRole({
        userId: existingUser.id,
        role: 'teacher',
        groupIds: ['google-linked-group'],
        createdBy: existingUser.id,
      });
      stubGooglePayload({
        email: existingEmail,
        sub: 'google-link-sub',
        name: 'Existing Google User',
      });
      const linkedLogin = await authService.loginWithGoogle('link-existing-user-token');
      if (!linkedLogin.ok) {
        throw new Error('Expected Google login to succeed for existing user');
      }
      assert.strictEqual(linkedLogin.data.user.roles[0]?.role, 'teacher');

      const linkedUser = await userStorage.getUserByGoogleId('google-link-sub');
      assert.ok(linkedUser);
      assert.strictEqual(linkedUser.id, existingUser.id);
      assert.strictEqual(linkedUser.emailVerified, true);

      const unknownEmail = uniqueEmail('google-create-new');
      stubGooglePayload({
        email: unknownEmail,
        sub: 'google-create-sub',
        name: 'Unknown Google User',
      });
      const unknownAccountLogin = await authService.loginWithGoogle('create-new-user-token');
      assert.deepStrictEqual(unknownAccountLogin, {
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Google sign-in is only available for existing or preapproved accounts',
        },
      });
      assert.strictEqual(await userStorage.getUserByGoogleId('google-create-sub'), null);

      await setUserActive(existingUser.id, false);
      stubGooglePayload({
        email: existingEmail,
        sub: 'google-link-sub',
        name: 'Existing Google User',
      });
      const inactiveLogin = await authService.loginWithGoogle('inactive-google-user-token');
      assert.deepStrictEqual(inactiveLogin, {
        ok: false,
        error: { code: 'FORBIDDEN', message: 'Account inactive' },
      });

      stubGoogleError('Google token verification timed out after 15000ms');
      const timeoutLogin = await authService.loginWithGoogle('timeout-google-token');
      assert.deepStrictEqual(timeoutLogin, {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Google verification timed out. Please try again.',
        },
      });

      stubGoogleError('Google verification exploded');
      const genericFailure = await authService.loginWithGoogle('generic-google-token');
      assert.deepStrictEqual(genericFailure, {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Google authentication failed',
        },
      });
    });

    void test('returns unauthorized when Google linking cannot reload the existing user', async () => {
      setGoogleClientId('test-google-client-id');

      const disappearingGoogleId = 'google-disappearing-sub';
      const triggerName = `google_disappear_${String(Date.now())}`;
      const functionName = `${triggerName}_fn`;
      const existingEmail = uniqueEmail('google-disappearing');
      const existingUser = await userStorage.createUser({
        email: existingEmail,
        name: 'Google Disappearing User',
        password: DEFAULT_PASSWORD,
      });

      try {
        await db.execute(
          sql.raw(`
            CREATE OR REPLACE FUNCTION ${functionName}()
            RETURNS trigger AS $$
            BEGIN
              IF NEW.google_id = '${disappearingGoogleId}' THEN
                DELETE FROM users WHERE id = NEW.id;
              END IF;
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
          `)
        );
        await db.execute(
          sql.raw(`
            CREATE TRIGGER ${triggerName}
            AFTER UPDATE ON users
            FOR EACH ROW
            EXECUTE FUNCTION ${functionName}();
          `)
        );

        stubGooglePayload({
          email: existingEmail,
          sub: disappearingGoogleId,
          name: 'Google Disappearing User',
        });

        const result = await authService.loginWithGoogle('disappearing-google-token');
        assert.deepStrictEqual(result, {
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Failed to create or find user',
          },
        });
        assert.strictEqual(await userStorage.getUserById(existingUser.id), null);
      } finally {
        await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON users;`));
        await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${functionName}();`));
      }
    });
  });
});
