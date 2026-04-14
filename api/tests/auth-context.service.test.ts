import assert from 'node:assert';
import test from 'node:test';

import type { JWTPayload } from '../src/types/index.js';

const AuthContextService = await import('../src/services/auth-context.service.js');

await test('auth context service preserves the JWT payload shape', async () => {
  const user: JWTPayload = {
    sub: 'test-user',
    email: 'teacher@example.com',
    name: 'Teacher',
    roles: [{ role: 'teacher', groupIds: ['group-1'] }],
    type: 'access',
  };

  const result = await AuthContextService.syncJwtRolesFromDb(user);
  assert.strictEqual(result.sub, user.sub);
  assert.strictEqual(result.email, user.email);
  assert.strictEqual(result.name, user.name);
  assert.ok(Array.isArray(result.roles));
  assert.strictEqual(result.type, 'access');
});
