import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createHash } from 'node:crypto';

import { generateProofToken } from '../src/lib/proof-token.js';

void describe('proof-token', () => {
  void test('generateProofToken matches sha256(hostname+secret) base64', async () => {
    const hostname = 'host-01';
    const secret = 'secret';

    const expected = createHash('sha256')
      .update(hostname + secret)
      .digest('base64');

    const actual = await generateProofToken(hostname, secret);
    assert.strictEqual(actual, expected);
  });
});
