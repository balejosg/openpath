import fs from 'node:fs/promises';
import path from 'node:path';

interface WaitForFirefoxExtensionUuidOptions {
  profileDir: string;
  extensionId: string;
  timeoutMs?: number;
  pollMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_MS = 100;

function extractFirefoxExtensionUuid(prefsContent: string, extensionId: string): string | null {
  const match = /user_pref\("extensions\.webextensions\.uuids",\s*"(.+)"\);/.exec(prefsContent);
  if (match?.[1] === undefined) {
    return null;
  }

  const rawJson = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  let mapping: Record<string, string>;
  try {
    mapping = JSON.parse(rawJson) as Record<string, string>;
  } catch {
    return null;
  }

  const uuid = mapping[extensionId];
  return uuid && uuid !== '' ? uuid : null;
}

export async function waitForFirefoxExtensionUuid({
  profileDir,
  extensionId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_MS,
}: WaitForFirefoxExtensionUuidOptions): Promise<string> {
  const prefsPath = path.join(profileDir, 'prefs.js');
  const deadline = Date.now() + timeoutMs;
  let lastPrefsContent = '';

  while (Date.now() < deadline) {
    try {
      lastPrefsContent = await fs.readFile(prefsPath, 'utf8');
      const uuid = extractFirefoxExtensionUuid(lastPrefsContent, extensionId);
      if (uuid !== null) {
        return uuid;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    await new Promise((resolve) => {
      setTimeout(resolve, pollMs);
    });
  }

  if (!lastPrefsContent.includes('extensions.webextensions.uuids')) {
    throw new Error(`Could not find extensions.webextensions.uuids in ${prefsPath}`);
  }

  throw new Error(`Could not resolve extension UUID for ${extensionId}`);
}
