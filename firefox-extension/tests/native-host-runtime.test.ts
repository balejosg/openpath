import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

function encodeNativeMessage(payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

function decodeNativeMessage(output: Buffer): unknown {
  assert.ok(output.length >= 4, 'native host did not write a response header');
  const bodyLength = output.readUInt32LE(0);
  const body = output.subarray(4, 4 + bodyLength).toString('utf8');
  return JSON.parse(body);
}

function runNativeHostCheck(env: NodeJS.ProcessEnv, domains: string[]): unknown {
  const scriptPath = new URL('../native/openpath-native-host.py', import.meta.url);
  const result = spawnSync('python3', [scriptPath.pathname], {
    env,
    input: encodeNativeMessage({ action: 'check', domains }),
  });

  assert.equal(result.status, 0, result.stderr.toString('utf8'));
  return decodeNativeMessage(result.stdout);
}

void test('native host confirms local DNS blocks when OpenPath CLI is unavailable', () => {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'openpath-native-host-'));
  const whitelistPath = join(runtimeDir, 'whitelist.txt');
  writeFileSync(whitelistPath, '## WHITELIST\nallowed.example\n', 'utf8');

  const response = runNativeHostCheck(
    {
      ...process.env,
      OPENPATH_SYSTEM_DISABLED_FLAG: join(runtimeDir, 'system-disabled.flag'),
      OPENPATH_WHITELIST_CMD: '',
      OPENPATH_WHITELIST_FILE: whitelistPath,
      XDG_DATA_HOME: runtimeDir,
    },
    ['blocked.example']
  ) as {
    results?: {
      domain?: string;
      error?: string;
      in_whitelist?: boolean;
      policy_active?: boolean;
      resolves?: boolean;
    }[];
    success?: boolean;
  };

  assert.equal(response.success, true);
  assert.deepEqual(response.results, [
    {
      domain: 'blocked.example',
      in_whitelist: false,
      policy_active: true,
      resolves: false,
      resolved_ip: null,
    },
  ]);
});
