import { test } from 'node:test';
import assert from 'node:assert/strict';

import TestSupportService from '../src/services/test-support.service.js';

void test('test-support service toggles auto-approve flag', () => {
  const enabled = TestSupportService.setAutoApproveMachineRequests(true);
  const disabled = TestSupportService.setAutoApproveMachineRequests(false);

  assert.deepEqual(enabled, { enabled: true });
  assert.deepEqual(disabled, { enabled: false });
});
