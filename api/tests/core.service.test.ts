import { test } from 'node:test';
import assert from 'node:assert/strict';

import CoreService from '../src/services/core.service.js';

void test('core service exposes public client config', () => {
  const config = CoreService.getPublicClientConfig();
  assert.ok('googleClientId' in config);
});
