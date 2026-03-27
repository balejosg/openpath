import assert from 'node:assert';
import { describe, it } from 'node:test';
import { z } from 'zod';

import {
  getErrorMessage,
  normalize,
  parseApiResponse,
  parseEnv,
  safeJsonParse,
} from '../src/utils.js';

describe('getErrorMessage', () => {
  it('returns the message for Error instances', () => {
    assert.strictEqual(getErrorMessage(new Error('boom')), 'boom');
  });

  it('stringifies unknown values', () => {
    assert.strictEqual(getErrorMessage(42), '42');
  });
});

describe('normalize', () => {
  it('normalizes domains and emails', () => {
    assert.strictEqual(normalize.domain(' Example.COM '), 'example.com');
    assert.strictEqual(normalize.email(' User@Example.COM '), 'user@example.com');
  });
});

describe('parseEnv', () => {
  it('parses integers with fallback', () => {
    assert.strictEqual(parseEnv.int('12', 5), 12);
    assert.strictEqual(parseEnv.int('abc', 5), 5);
    assert.strictEqual(parseEnv.int('', 5), 5);
  });

  it('parses comma-separated lists with fallback', () => {
    assert.deepStrictEqual(parseEnv.list('a, b ,, c', ['x']), ['a', 'b', 'c']);
    assert.deepStrictEqual(parseEnv.list('', ['x']), ['x']);
  });

  it('parses booleans with fallback', () => {
    assert.strictEqual(parseEnv.bool('true', false), true);
    assert.strictEqual(parseEnv.bool('1', false), true);
    assert.strictEqual(parseEnv.bool('false', true), false);
    assert.strictEqual(parseEnv.bool('', true), true);
  });
});

describe('safeJsonParse', () => {
  const schema = z.object({ value: z.string() });

  it('returns parsed data when the payload is valid', () => {
    const result = safeJsonParse('{"value":"ok"}', schema);

    assert.deepStrictEqual(result, {
      success: true,
      data: { value: 'ok' },
    });
  });

  it('returns zod errors when validation fails', () => {
    const result = safeJsonParse('{"value":123}', schema);

    assert.strictEqual(result.success, false);
    assert.ok(result.error instanceof z.ZodError);
  });

  it('returns an Error when JSON is invalid', () => {
    const result = safeJsonParse('{bad json', schema);

    assert.strictEqual(result.success, false);
    assert.ok(result.error instanceof Error);
    assert.match(result.error.message, /json|unexpected/i);
  });
});

describe('parseApiResponse', () => {
  const schema = z.object({ value: z.string() });

  it('parses json() output with the provided schema', async () => {
    const response = {
      json: () => Promise.resolve({ value: 'ok' }),
    };

    await assert.doesNotReject(async () => {
      const parsed = await parseApiResponse(response, schema);
      assert.deepStrictEqual(parsed, { value: 'ok' });
    });
  });

  it('throws when the response payload does not match the schema', async () => {
    const response = {
      json: () => Promise.resolve({ value: 123 }),
    };

    await assert.rejects(() => parseApiResponse(response, schema), z.ZodError);
  });
});
