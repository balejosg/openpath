import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  computeMachineProofToken,
  isValidMachineProofToken,
  normalizeHostInput,
} from '../../src/lib/machine-proof.js';

void describe('machine-proof', () => {
  void test('normalizeHostInput trims and lowercases', () => {
    assert.strictEqual(normalizeHostInput('  HOST-01  '), 'host-01');
  });

  void test('computeMachineProofToken is deterministic', () => {
    const t1 = computeMachineProofToken('host', 'secret');
    const t2 = computeMachineProofToken('host', 'secret');
    assert.strictEqual(t1, t2);
    assert.ok(/^[A-Za-z0-9+/=]+$/.test(t1));
  });

  void test('isValidMachineProofToken accepts correct token', () => {
    const hostname = 'host';
    const secret = 'secret';
    const token = computeMachineProofToken(hostname, secret);
    assert.strictEqual(isValidMachineProofToken(hostname, token, secret), true);
  });

  void test('isValidMachineProofToken rejects incorrect token', () => {
    const hostname = 'host';
    const secret = 'secret';
    assert.strictEqual(isValidMachineProofToken(hostname, 'invalid', secret), false);
  });
});
