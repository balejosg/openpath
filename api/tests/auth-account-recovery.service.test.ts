import { test } from 'node:test';
import assert from 'node:assert/strict';

import AccountRecoveryService from '../src/services/auth-account-recovery.service.js';

void test('auth-account-recovery service exports recovery flows', () => {
  assert.equal(typeof AccountRecoveryService.generateEmailVerificationToken, 'function');
  assert.equal(typeof AccountRecoveryService.verifyEmail, 'function');
  assert.equal(typeof AccountRecoveryService.generateResetToken, 'function');
  assert.equal(typeof AccountRecoveryService.resetPassword, 'function');
});
