import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import type { Request } from 'express';

import { getErrorMessage } from '@openpath/shared';

import { logger } from './logger.js';
import { config } from '../config.js';

const WINDOWS_AGENT_ROOT = path.resolve(process.cwd(), '../windows');
const LINUX_AGENT_BUILD_ROOT = path.resolve(process.cwd(), '../build');
const WINDOWS_AGENT_VERSION_FILE = path.resolve(process.cwd(), '../VERSION');
const FIREFOX_EXTENSION_ROOT = path.resolve(process.cwd(), '../firefox-extension');
const FIREFOX_RELEASE_ROOT = path.join(FIREFOX_EXTENSION_ROOT, 'build', 'firefox-release');
export const FIREFOX_RELEASE_METADATA_FILE = path.join(FIREFOX_RELEASE_ROOT, 'metadata.json');
export const FIREFOX_RELEASE_XPI_FILE = path.join(
  FIREFOX_RELEASE_ROOT,
  'openpath-firefox-extension.xpi'
);
const CHROMIUM_MANAGED_ROOT = path.join(FIREFOX_EXTENSION_ROOT, 'build', 'chromium-managed');
export const CHROMIUM_MANAGED_METADATA_FILE = path.join(CHROMIUM_MANAGED_ROOT, 'metadata.json');
export const CHROMIUM_MANAGED_CRX_FILE = path.join(
  CHROMIUM_MANAGED_ROOT,
  'openpath-chromium-extension.crx'
);
const WINDOWS_AGENT_DIRECTORIES = ['lib', 'scripts'] as const;
const WINDOWS_AGENT_RUNTIME_ROOT_FILES = ['OpenPath.ps1', 'Rotate-Token.ps1'] as const;
const WINDOWS_AGENT_BOOTSTRAP_ROOT_FILES = [
  'Install-OpenPath.ps1',
  'Uninstall-OpenPath.ps1',
  'OpenPath.ps1',
  'Rotate-Token.ps1',
] as const;
const FIREFOX_EXTENSION_DIRECTORIES = ['dist', 'popup', 'icons', 'blocked', 'native'] as const;

export interface ChromiumManagedMetadata {
  extensionId: string;
  version: string;
}

export interface FirefoxReleaseMetadata {
  extensionId: string;
  version: string;
}

export interface WindowsAgentFileEntry {
  relativePath: string;
  absolutePath: string;
  sha256: string;
  size: number;
}

export interface LinuxAgentPackageEntry {
  version: string;
  packageFileName: string;
  absolutePath: string;
  sha256: string;
  size: number;
  minSupportedVersion: string;
  minDirectUpgradeVersion: string;
  bridgeVersions: string[];
  downloadPath: string;
}

function listFilesRecursively(directoryPath: string): string[] {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  const files: string[] = [];
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(fullPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

export function readServerVersion(): string {
  const envVersion = process.env.OPENPATH_VERSION?.trim();
  if (envVersion) {
    return envVersion;
  }

  try {
    const fileVersion = fs.readFileSync(WINDOWS_AGENT_VERSION_FILE, 'utf8').trim();
    if (fileVersion) {
      return fileVersion;
    }
  } catch {
    // Best-effort fallback; missing version file should not break runtime.
  }

  return '0.0.0';
}

export function readLinuxAgentVersion(): string {
  const envVersion = process.env.OPENPATH_LINUX_AGENT_VERSION?.trim();
  if (envVersion) {
    return envVersion;
  }

  return readServerVersion();
}

function normalizeManifestRelativePath(relativePath: string): string | null {
  const normalizedPath = relativePath.replaceAll('\\', '/');
  if (!normalizedPath || normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
    return null;
  }

  return normalizedPath;
}

export function readChromiumManagedMetadata(): ChromiumManagedMetadata | null {
  if (!fs.existsSync(CHROMIUM_MANAGED_METADATA_FILE) || !fs.existsSync(CHROMIUM_MANAGED_CRX_FILE)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(CHROMIUM_MANAGED_METADATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ChromiumManagedMetadata>;
    if (!parsed.extensionId || !parsed.version) {
      return null;
    }

    return {
      extensionId: parsed.extensionId,
      version: parsed.version,
    };
  } catch (error) {
    logger.warn('Failed to read Chromium managed extension metadata', {
      error: getErrorMessage(error),
      path: CHROMIUM_MANAGED_METADATA_FILE,
    });
    return null;
  }
}

export function readFirefoxReleaseMetadata(): FirefoxReleaseMetadata | null {
  if (!fs.existsSync(FIREFOX_RELEASE_METADATA_FILE) || !fs.existsSync(FIREFOX_RELEASE_XPI_FILE)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(FIREFOX_RELEASE_METADATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<FirefoxReleaseMetadata>;
    if (!parsed.extensionId || !parsed.version) {
      return null;
    }

    return {
      extensionId: parsed.extensionId,
      version: parsed.version,
    };
  } catch (error) {
    logger.warn('Failed to read Firefox release extension metadata', {
      error: getErrorMessage(error),
      path: FIREFOX_RELEASE_METADATA_FILE,
    });
    return null;
  }
}

export function buildWindowsAgentFileManifest(options?: {
  includeBootstrapFiles?: boolean;
}): WindowsAgentFileEntry[] {
  const rootFiles = options?.includeBootstrapFiles
    ? WINDOWS_AGENT_BOOTSTRAP_ROOT_FILES
    : WINDOWS_AGENT_RUNTIME_ROOT_FILES;
  const manifestSources = new Map<string, string>();

  const addManifestFile = (relativePath: string, absolutePath: string): void => {
    if (!fs.existsSync(absolutePath)) {
      return;
    }

    const normalizedRelativePath = normalizeManifestRelativePath(relativePath);
    if (!normalizedRelativePath) {
      return;
    }

    manifestSources.set(normalizedRelativePath, path.resolve(absolutePath));
  };

  const addManifestDirectory = (
    sourceRoot: string,
    targetRoot: string,
    allowedExtensions?: RegExp
  ): void => {
    for (const absolutePath of listFilesRecursively(sourceRoot)) {
      if (allowedExtensions && !allowedExtensions.exec(absolutePath)) {
        continue;
      }

      const relativePath = path.relative(sourceRoot, absolutePath).replaceAll('\\', '/');
      if (!relativePath || relativePath.startsWith('..')) {
        continue;
      }

      addManifestFile(path.posix.join(targetRoot, relativePath), absolutePath);
    }
  };

  for (const fileName of rootFiles) {
    addManifestFile(fileName, path.join(WINDOWS_AGENT_ROOT, fileName));
  }

  for (const relativeDirectory of WINDOWS_AGENT_DIRECTORIES) {
    const absoluteDirectory = path.join(WINDOWS_AGENT_ROOT, relativeDirectory);
    addManifestDirectory(absoluteDirectory, relativeDirectory, /\.(ps1|psm1|cmd)$/i);
  }

  addManifestFile(
    'browser-extension/firefox/manifest.json',
    path.join(FIREFOX_EXTENSION_ROOT, 'manifest.json')
  );
  for (const relativeDirectory of FIREFOX_EXTENSION_DIRECTORIES) {
    addManifestDirectory(
      path.join(FIREFOX_EXTENSION_ROOT, relativeDirectory),
      path.posix.join('browser-extension/firefox', relativeDirectory)
    );
  }
  addManifestFile('browser-extension/firefox-release/metadata.json', FIREFOX_RELEASE_METADATA_FILE);
  addManifestFile(
    'browser-extension/firefox-release/openpath-firefox-extension.xpi',
    FIREFOX_RELEASE_XPI_FILE
  );

  addManifestFile(
    'browser-extension/chromium-managed/metadata.json',
    CHROMIUM_MANAGED_METADATA_FILE
  );

  return Array.from(manifestSources.entries())
    .map(([relativePath, absolutePath]) => {
      const fileBuffer = fs.readFileSync(absolutePath);
      return {
        relativePath,
        absolutePath,
        sha256: createHash('sha256').update(fileBuffer).digest('hex'),
        size: fileBuffer.length,
      };
    })
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function getLinuxAgentPackageFileName(version: string): string {
  return `openpath-dnsmasq_${version}-1_amd64.deb`;
}

function parseLinuxBridgeVersions(): string[] {
  const rawValue = process.env.OPENPATH_LINUX_AGENT_BRIDGE_VERSIONS?.trim();
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(',')
    .map((version) => version.trim())
    .filter((version) => version.length > 0);
}

export function resolveLinuxAgentPackagePath(version: string): string | null {
  const configuredPath = process.env.OPENPATH_LINUX_AGENT_PACKAGE_PATH?.trim();
  if (configuredPath) {
    const resolvedPath = path.resolve(configuredPath);
    if (fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }

  const configuredDirectory = process.env.OPENPATH_LINUX_AGENT_PACKAGE_DIR?.trim();
  if (configuredDirectory) {
    const candidatePath = path.join(
      path.resolve(configuredDirectory),
      getLinuxAgentPackageFileName(version)
    );
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  const defaultCandidatePath = path.join(
    LINUX_AGENT_BUILD_ROOT,
    getLinuxAgentPackageFileName(version)
  );
  if (fs.existsSync(defaultCandidatePath)) {
    return defaultCandidatePath;
  }

  return null;
}

export function buildLinuxAgentPackageManifest(): LinuxAgentPackageEntry | null {
  const version = readLinuxAgentVersion();
  const absolutePath = resolveLinuxAgentPackagePath(version);
  if (!absolutePath) {
    return null;
  }

  const packageBuffer = fs.readFileSync(absolutePath);
  const packageFileName = path.basename(absolutePath);
  const minSupportedVersion = process.env.OPENPATH_LINUX_AGENT_MIN_SUPPORTED_VERSION?.trim();
  const minDirectUpgradeVersion =
    process.env.OPENPATH_LINUX_AGENT_MIN_DIRECT_UPGRADE_VERSION?.trim();

  return {
    version,
    packageFileName,
    absolutePath,
    sha256: createHash('sha256').update(packageBuffer).digest('hex'),
    size: packageBuffer.length,
    minSupportedVersion:
      minSupportedVersion && minSupportedVersion.length > 0 ? minSupportedVersion : '0.0.0',
    minDirectUpgradeVersion:
      minDirectUpgradeVersion && minDirectUpgradeVersion.length > 0
        ? minDirectUpgradeVersion
        : '0.0.0',
    bridgeVersions: parseLinuxBridgeVersions(),
    downloadPath: `/api/agent/linux/package?version=${encodeURIComponent(version)}`,
  };
}

export function getPublicBaseUrl(req: Request): string {
  const configuredBaseUrl = config.publicUrl?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '');
  }

  return `${req.protocol}://${req.get('host') ?? `${config.host}:${String(config.port)}`}`.replace(
    /\/+$/,
    ''
  );
}

export function quotePowerShellSingle(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildWhitelistEtag(params: {
  groupId: string;
  updatedAt: Date;
  enabled: boolean;
}): string {
  const version = `${params.groupId}:${params.updatedAt.toISOString()}:${params.enabled ? '1' : '0'}`;
  const hash = createHash('sha256').update(version).digest('base64url');
  return `"${hash}"`;
}

export function buildStaticEtag(key: string): string {
  const hash = createHash('sha256').update(key).digest('base64url');
  return `"${hash}"`;
}

export function matchesIfNoneMatch(req: Request, etag: string): boolean {
  const header = req.headers['if-none-match'];
  if (typeof header !== 'string') return false;
  const trimmed = header.trim();
  if (trimmed === '*') return true;

  const values = trimmed
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  for (const v of values) {
    if (v === etag) return true;
    if (v.startsWith('W/') && v.slice(2).trim() === etag) return true;
  }
  return false;
}
