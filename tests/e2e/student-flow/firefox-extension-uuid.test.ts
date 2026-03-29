import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { waitForFirefoxExtensionUuid } from './firefox-extension-uuid.js';

await test('waitForFirefoxExtensionUuid tolerates delayed extension UUID registration', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpath-firefox-profile-'));
  const prefsPath = path.join(tempDir, 'prefs.js');
  const extensionId = 'monitor-bloqueos@openpath';

  fs.writeFileSync(
    prefsPath,
    'user_pref("extensions.webextensions.uuids", "{\\"other@example.com\\":\\"other-uuid\\"}");\n',
    'utf8'
  );

  setTimeout(() => {
    fs.writeFileSync(
      prefsPath,
      'user_pref("extensions.webextensions.uuids", "{\\"other@example.com\\":\\"other-uuid\\",\\"monitor-bloqueos@openpath\\":\\"expected-uuid\\"}");\n',
      'utf8'
    );
  }, 50);

  const extensionUuid = await waitForFirefoxExtensionUuid({
    profileDir: tempDir,
    extensionId,
    timeoutMs: 500,
    pollMs: 10,
  });

  assert.equal(extensionUuid, 'expected-uuid');
});

await test('waitForFirefoxExtensionUuid retries when prefs.js is temporarily malformed', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpath-firefox-profile-'));
  const prefsPath = path.join(tempDir, 'prefs.js');
  const extensionId = 'monitor-bloqueos@openpath';

  fs.writeFileSync(
    prefsPath,
    'user_pref("extensions.webextensions.uuids", "{\\"monitor-bloqueos@openpath\\":");\n',
    'utf8'
  );

  setTimeout(() => {
    fs.writeFileSync(
      prefsPath,
      'user_pref("extensions.webextensions.uuids", "{\\"monitor-bloqueos@openpath\\":\\"recovered-uuid\\"}");\n',
      'utf8'
    );
  }, 50);

  const extensionUuid = await waitForFirefoxExtensionUuid({
    profileDir: tempDir,
    extensionId,
    timeoutMs: 500,
    pollMs: 10,
  });

  assert.equal(extensionUuid, 'recovered-uuid');
});

await test('waitForFirefoxExtensionUuid retries until prefs.js is created', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpath-firefox-profile-'));
  const prefsPath = path.join(tempDir, 'prefs.js');
  const extensionId = 'monitor-bloqueos@openpath';

  setTimeout(() => {
    fs.writeFileSync(
      prefsPath,
      'user_pref("extensions.webextensions.uuids", "{\\"monitor-bloqueos@openpath\\":\\"created-later-uuid\\"}");\n',
      'utf8'
    );
  }, 50);

  const extensionUuid = await waitForFirefoxExtensionUuid({
    profileDir: tempDir,
    extensionId,
    timeoutMs: 500,
    pollMs: 10,
  });

  assert.equal(extensionUuid, 'created-later-uuid');
});
