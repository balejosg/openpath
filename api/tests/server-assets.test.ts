import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';

await describe('server asset helpers', async () => {
  const { buildStaticEtag, buildWhitelistEtag, matchesIfNoneMatch, quotePowerShellSingle } =
    await import('../src/lib/server-assets.js');

  await test('quotes PowerShell strings and generates stable etags', () => {
    const updatedAt = new Date('2026-04-01T12:00:00Z');
    const etagA = buildWhitelistEtag({
      groupId: 'group-1',
      updatedAt,
      enabled: true,
    });
    const etagB = buildWhitelistEtag({
      groupId: 'group-1',
      updatedAt,
      enabled: true,
    });

    assert.equal(quotePowerShellSingle("teacher's file"), "'teacher''s file'");
    assert.equal(etagA, etagB);
    assert.match(buildStaticEtag('windows-agent'), /^".+"$/);
  });

  await test('matches if-none-match with strong and weak etags', () => {
    const etag = '"etag-value"';

    assert.equal(
      matchesIfNoneMatch(
        {
          headers: { 'if-none-match': etag },
        } as never,
        etag
      ),
      true
    );
    assert.equal(
      matchesIfNoneMatch(
        {
          headers: { 'if-none-match': `W/${etag}` },
        } as never,
        etag
      ),
      true
    );
    assert.equal(
      matchesIfNoneMatch(
        {
          headers: { 'if-none-match': '"other"' },
        } as never,
        etag
      ),
      false
    );
  });
});
