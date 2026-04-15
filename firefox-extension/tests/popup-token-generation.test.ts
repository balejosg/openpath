import { describe, test } from 'node:test';
import assert from 'node:assert';

function generateToken(hostname: string, secret: string): Promise<string> {
  return Promise.resolve(Buffer.from(hostname + secret).toString('base64'));
}

void describe('popup token generation', () => {
  void test('is deterministic for the same input', async () => {
    const token1 = await generateToken('host1', 'secret123');
    const token2 = await generateToken('host1', 'secret123');
    assert.strictEqual(token1, token2);
  });

  void test('changes with different hostnames and secrets', async () => {
    assert.notStrictEqual(
      await generateToken('host1', 'secret'),
      await generateToken('host2', 'secret')
    );
    assert.notStrictEqual(
      await generateToken('host', 'secret1'),
      await generateToken('host', 'secret2')
    );
  });

  void test('returns base64 strings even for empty or special-case inputs', async () => {
    const token = await generateToken('test-host', 'test-secret');
    assert.ok(/^[A-Za-z0-9+/=]+$/.test(token));
    assert.ok((await generateToken('', 'secret')).length > 0);
    assert.ok((await generateToken('hostname', '')).length > 0);
    assert.ok((await generateToken('host.with-special_chars', 'secret')).length > 0);
  });
});
