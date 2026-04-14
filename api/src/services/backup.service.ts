import { recordBackup } from '../lib/settings-storage.js';

export interface BackupRecordInput {
  sizeBytes?: number | undefined;
  status: 'success' | 'failed';
}

export async function recordBackupCompletion(
  input: BackupRecordInput
): Promise<{ recordedAt: string; success: true } | { error: string; success: false }> {
  const success = await recordBackup(input.status, input.sizeBytes);

  if (!success) {
    return { success: false, error: 'Failed to record backup' };
  }

  return { success: true, recordedAt: new Date().toISOString() };
}

export default {
  recordBackupCompletion,
};
