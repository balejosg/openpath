import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';

await describe('server request auth helpers', async () => {
  const { getFirstParam, isCookieAuthenticatedMutation, isTrustedCsrfOrigin } =
    await import('../src/lib/server-request-auth.js');

  await test('detects cookie-authenticated mutation requests without bearer tokens', () => {
    process.env.OPENPATH_ACCESS_TOKEN_COOKIE_NAME = 'openpath_access';

    const req = {
      method: 'POST',
      headers: {
        cookie: 'openpath_access=session-token',
      },
    } as const;

    assert.equal(isCookieAuthenticatedMutation(req as never), true);
    assert.equal(
      isCookieAuthenticatedMutation({
        ...req,
        headers: {
          ...req.headers,
          authorization: 'Bearer machine-token',
        },
      } as never),
      false
    );
  });

  await test('accepts same-origin and allowlisted CSRF origins and unwraps first params', () => {
    const req = {
      protocol: 'https',
      headers: {},
      get(name: string): string | undefined {
        if (name === 'host') return 'example.test';
        if (name === 'origin') return 'https://allowed.example';
        return undefined;
      },
    };

    assert.equal(isTrustedCsrfOrigin(req as never, ['https://allowed.example']), true);
    assert.equal(getFirstParam(['first', 'second']), 'first');
    assert.equal(getFirstParam('only'), 'only');
    assert.equal(getFirstParam(undefined), undefined);
  });
});
