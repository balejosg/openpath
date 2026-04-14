import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStaticEtag,
  buildWhitelistEtag,
  matchesIfNoneMatch,
} from '../src/lib/server-asset-http.js';

void test('server-asset-http builds stable etags and matches If-None-Match values', () => {
  const staticEtag = buildStaticEtag('openpath');
  const whitelistEtag = buildWhitelistEtag({
    groupId: 'group-1',
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    enabled: true,
  });

  assert.match(staticEtag, /^".+"$/);
  assert.match(whitelistEtag, /^".+"$/);
  assert.equal(
    matchesIfNoneMatch(
      { headers: { 'if-none-match': `W/${whitelistEtag}` } } as never,
      whitelistEtag
    ),
    true
  );
});
