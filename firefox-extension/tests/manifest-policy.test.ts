import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const extensionRoot = path.resolve(import.meta.dirname, '..');

interface FirefoxManifest {
  content_security_policy?: {
    extension_pages?: string;
  };
  host_permissions?: string[];
}

async function readManifest(): Promise<FirefoxManifest> {
  return JSON.parse(
    await readFile(path.join(extensionRoot, 'manifest.json'), 'utf8')
  ) as FirefoxManifest;
}

void describe('Firefox extension manifest policy', () => {
  void test('does not upgrade configured HTTP request API endpoints to HTTPS', async () => {
    const manifest = await readManifest();
    const extensionPolicy = manifest.content_security_policy?.extension_pages ?? '';

    assert.match(extensionPolicy, /script-src 'self'/);
    assert.doesNotMatch(extensionPolicy, /upgrade-insecure-requests/);
  });

  void test('keeps network host permissions broad enough for configured tenant APIs', async () => {
    const manifest = await readManifest();

    assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
  });
});
