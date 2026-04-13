import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type RawStorageModule,
  registerCoverageRegressionLifecycle,
} from './coverage-regressions-test-harness.js';

registerCoverageRegressionLifecycle();

void describe('coverage regressions - legacy storage fallbacks', () => {
  void it('covers legacy request fallback queries and delete helper paths', async () => {
    const dbModule = await import('../src/db/index.js');
    const originalExecute = dbModule.db.execute.bind(dbModule.db);

    const legacyRow = {
      id: 'req_legacy_1',
      domain: 'legacy.example.com',
      reason: 'Legacy reason',
      requester_email: 'legacy@example.com',
      group_id: 'default',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resolved_at: null,
      resolved_by: null,
      resolution_note: '',
    };

    let executeIndex = 0;
    dbModule.db.execute = (() => {
      executeIndex += 1;
      if (executeIndex === 1) {
        return Promise.resolve({ rows: [{ has_source: false }] } as never);
      }
      if (executeIndex <= 4) {
        return Promise.resolve({ rows: [legacyRow] } as never);
      }
      return Promise.resolve({
        rows: [{ ...legacyRow, id: 'req_legacy_2', domain: 'created.example.com' }],
      } as never);
    }) as unknown as typeof dbModule.db.execute;

    try {
      const tag = `legacy-storage-${Date.now().toString()}-${Math.random().toString(16).slice(2)}`;
      const rawStorage = (await import(`../src/lib/storage.ts?${tag}`)) as RawStorageModule;

      assert.strictEqual((await rawStorage.getAllRequests()).length, 1);
      assert.strictEqual((await rawStorage.getRequestsByGroup('default')).length, 1);
      assert.strictEqual((await rawStorage.getRequestById('req_legacy_1'))?.id, 'req_legacy_1');

      const created = await rawStorage.createRequest({
        domain: 'created.example.com',
        requesterEmail: 'created@example.com',
        groupId: 'default',
      });
      assert.strictEqual(created.domain, 'created.example.com');
    } finally {
      dbModule.db.execute = originalExecute;
    }
  });
});
