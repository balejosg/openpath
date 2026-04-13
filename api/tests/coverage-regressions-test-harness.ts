import assert from 'node:assert';
import { after, before } from 'node:test';

import type { HttpTestHarness } from './http-test-harness.js';
import { startHttpTestHarness } from './http-test-harness.js';

type RawStorageModule = typeof import('../src/lib/storage.js');

let harness: HttpTestHarness | undefined;

export function registerCoverageRegressionLifecycle(): void {
  before(async () => {
    harness = await startHttpTestHarness({
      env: {
        JWT_SECRET: 'coverage-regressions-secret',
        NODE_ENV: 'test',
      },
      resetDb: true,
    });
  });

  after(async () => {
    await harness?.close();
    harness = undefined;
  });
}

export function getCoverageRegressionHarness(): HttpTestHarness {
  assert.ok(harness, 'Coverage regression harness should be initialized');
  return harness;
}

export type { RawStorageModule };
