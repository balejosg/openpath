import assert from 'node:assert';
import test from 'node:test';

const BackupService = await import('../src/services/backup.service.js');

await test('backup service exposes backup recording entrypoint', () => {
  assert.strictEqual(typeof BackupService.recordBackupCompletion, 'function');
  assert.strictEqual(typeof BackupService.default.recordBackupCompletion, 'function');
});
