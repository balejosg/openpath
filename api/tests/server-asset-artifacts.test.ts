import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearLinuxAgentAptMetadataCache,
  getAgentArtifactRoots,
  stableAptMetadataAdvertisesLinuxAgentVersion,
} from '../src/lib/server-asset-artifacts.js';

void test('server-asset-artifacts exposes roots and parses apt metadata', () => {
  clearLinuxAgentAptMetadataCache();

  const roots = getAgentArtifactRoots();
  assert.equal(typeof roots.windowsAgentRoot, 'string');
  assert.equal(
    stableAptMetadataAdvertisesLinuxAgentVersion(
      'Package: openpath-dnsmasq\nVersion: 1.2.3-1\n',
      '1.2.3'
    ),
    true
  );
});
