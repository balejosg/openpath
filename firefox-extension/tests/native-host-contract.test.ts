import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(projectRoot, 'native', 'whitelist_native_host.json');
const backgroundPath = path.join(projectRoot, 'src', 'background.ts');

void describe('Firefox native host contract', () => {
  void test('manifest template uses the Firefox host name expected by the extension', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      name?: string;
      allowed_extensions?: string[];
    };
    const backgroundSource = await readFile(backgroundPath, 'utf8');
    const hostNameMatch = /const NATIVE_HOST_NAME = '([^']+)'/.exec(backgroundSource);

    assert.ok(hostNameMatch, 'background.ts should declare NATIVE_HOST_NAME');
    assert.equal(
      path.basename(manifestPath),
      `${hostNameMatch[1]}.json`,
      'native host manifest filename should stay in sync with background.ts'
    );
    assert.equal(
      manifest.name,
      hostNameMatch[1],
      'native host manifest name should stay in sync with background.ts'
    );
    assert.equal(manifest.name, 'whitelist_native_host');
  });

  void test('manifest template allows the signed Firefox extension id', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      allowed_extensions?: string[];
    };

    assert.deepEqual(manifest.allowed_extensions, ['monitor-bloqueos@openpath']);
  });
});
