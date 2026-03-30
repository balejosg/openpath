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

function summarizePrefsContent(prefsContent: string): string {
  if (prefsContent === '') {
    return 'missing';
  }

  const match = /user_pref\("extensions\.webextensions\.uuids",\s*"(.+)"\);/.exec(prefsContent);
  if (match?.[1] === undefined) {
    return 'present-no-uuids';
  }

  const rawJson = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  try {
    const mapping = JSON.parse(rawJson) as Record<string, string>;
    return `uuids:[${Object.keys(mapping).join(',')}]`;
  } catch {
    return 'malformed-uuids';
  }
}

async function summarizeFirefoxProfileFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content === '' ? 'empty' : 'present';
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return 'missing';
    }

    return `unreadable:${code ?? 'unknown'}`;
  }
}

async function summarizeExtensionsJson(profileDir: string): Promise<string> {
  const filePath = path.join(profileDir, 'extensions.json');

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const payload = JSON.parse(content) as { addons?: Array<{ id?: string }> };
    const addonIds = (payload.addons ?? []).flatMap((addon) =>
      typeof addon.id === 'string' && addon.id !== '' ? [addon.id] : []
    );

    return addonIds.length > 0 ? `addons:[${addonIds.join(',')}]` : 'addons:[]';
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return 'missing';
    }

    if (error instanceof SyntaxError) {
      return 'malformed';
    }

    return `unreadable:${code ?? 'unknown'}`;
  }
}

async function summarizePrefsFile(profileDir: string, prefsContent: string): Promise<string> {
  const prefsPath = path.join(profileDir, 'prefs.js');
  try {
    await fs.access(prefsPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'missing';
    }

    return `unreadable:${(error as NodeJS.ErrnoException).code ?? 'unknown'}`;
  }

  if (prefsContent === '') {
    return 'empty';
  }

  return summarizePrefsContent(prefsContent);
}

async function buildFirefoxProfileDiagnostics(
  profileDir: string,
  prefsContent: string
): Promise<string> {
  const addonStartupSummary = await summarizeFirefoxProfileFile(
    path.join(profileDir, 'addonStartup.json.lz4')
  );

  return [
    `prefs.js=${await summarizePrefsFile(profileDir, prefsContent)}`,
    `extensions.json=${await summarizeExtensionsJson(profileDir)}`,
    `addonStartup.json.lz4=${addonStartupSummary}`,
  ].join('; ');
}

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
    throw new Error(
      `Could not find extensions.webextensions.uuids in ${prefsPath} (${await buildFirefoxProfileDiagnostics(profileDir, lastPrefsContent)})`
    );
  }

  throw new Error(
    `Could not resolve extension UUID for ${extensionId} (${await buildFirefoxProfileDiagnostics(profileDir, lastPrefsContent)})`
  );
}
