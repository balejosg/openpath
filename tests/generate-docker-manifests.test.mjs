import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import {
  buildDockerManifest,
  DOCKER_MANIFEST_CASES,
  formatDockerManifest,
  projectRoot,
} from '../scripts/generate-docker-manifests.mjs';

test('docker manifest generator matches committed manifests', async () => {
  for (const manifestCase of DOCKER_MANIFEST_CASES) {
    const targetPath = resolve(projectRoot, manifestCase.dockerPackagePath);
    const expected = await formatDockerManifest(
      buildDockerManifest(projectRoot, manifestCase),
      targetPath
    );
    const actual = readFileSync(targetPath, 'utf8');

    assert.equal(
      actual,
      expected,
      `${manifestCase.dockerPackagePath} should match the generated Docker manifest`
    );
  }
});
