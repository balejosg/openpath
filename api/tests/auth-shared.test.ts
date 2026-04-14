import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EMAIL_VERIFICATION_REQUIRED_MESSAGE, mapRoleInfo } from '../src/services/auth-shared.js';

void test('auth-shared maps roles and builds auth payloads', () => {
  const roles = mapRoleInfo([{ role: 'openpath-admin', groupIds: null }]);

  assert.deepEqual(roles, [{ role: 'admin', groupIds: [] }]);
  assert.equal(EMAIL_VERIFICATION_REQUIRED_MESSAGE.length > 0, true);
});
