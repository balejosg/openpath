import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { getErrorMessage } from '@openpath/shared';

import {
  getAgentArtifactRoots,
  readServerVersion,
  type LinuxAgentPackageEntry,
} from './server-asset-roots.js';
import { logger } from './logger.js';

const STABLE_APT_PACKAGES_RELATIVE_PATH = 'dists/stable/main/binary-amd64/Packages';
const LINUX_AGENT_APT_METADATA_CACHE_TTL_MS = 5 * 60 * 1000;
const linuxAgentAptMetadataCache = new Map<string, { fetchedAt: number; content: string }>();

export function readLinuxAgentVersion(): string {
  const envVersion = process.env.OPENPATH_LINUX_AGENT_VERSION?.trim();
  if (envVersion) {
    return envVersion;
  }

  return readServerVersion();
}

function buildStableAptPackagesUrl(aptRepoUrl: string): string {
  return `${aptRepoUrl.replace(/\/+$/, '')}/${STABLE_APT_PACKAGES_RELATIVE_PATH}`;
}

export function stableAptMetadataAdvertisesLinuxAgentVersion(
  content: string,
  version: string
): boolean {
  const targetVersion = version.trim();
  if (!targetVersion) {
    return false;
  }

  for (const block of content.split(/\r?\n\r?\n+/)) {
    let packageName = '';
    let packageVersion = '';

    for (const rawLine of block.split(/\r?\n/)) {
      const separatorIndex = rawLine.indexOf(':');
      if (separatorIndex === -1) {
        continue;
      }

      const key = rawLine.slice(0, separatorIndex).trim();
      const value = rawLine.slice(separatorIndex + 1).trim();

      if (key === 'Package') {
        packageName = value;
      } else if (key === 'Version') {
        packageVersion = value.replace(/-[^-]+$/, '');
      }
    }

    if (packageName === 'openpath-dnsmasq' && packageVersion === targetVersion) {
      return true;
    }
  }

  return false;
}

async function downloadStableAptPackagesManifest(aptRepoUrl: string): Promise<string> {
  const packagesUrl = buildStableAptPackagesUrl(aptRepoUrl);
  const cachedEntry = linuxAgentAptMetadataCache.get(packagesUrl);
  if (cachedEntry && Date.now() - cachedEntry.fetchedAt < LINUX_AGENT_APT_METADATA_CACHE_TTL_MS) {
    return cachedEntry.content;
  }

  const response = await fetch(packagesUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch stable APT metadata (${String(response.status)} ${response.statusText})`
    );
  }

  const content = await response.text();
  linuxAgentAptMetadataCache.set(packagesUrl, {
    fetchedAt: Date.now(),
    content,
  });
  return content;
}

export function clearLinuxAgentAptMetadataCache(): void {
  linuxAgentAptMetadataCache.clear();
}

export async function resolveEnrollmentLinuxAgentVersionPin(
  aptRepoUrl: string,
  configuredVersion: string
): Promise<string> {
  const version = configuredVersion.trim();
  if (!version) {
    return '';
  }

  try {
    const manifest = await downloadStableAptPackagesManifest(aptRepoUrl);
    if (stableAptMetadataAdvertisesLinuxAgentVersion(manifest, version)) {
      return version;
    }

    logger.warn('Skipping stale OPENPATH_LINUX_AGENT_VERSION pin for enrollment script', {
      version,
      packagesUrl: buildStableAptPackagesUrl(aptRepoUrl),
    });
    return '';
  } catch (error) {
    logger.warn('Failed to validate OPENPATH_LINUX_AGENT_VERSION against stable APT metadata', {
      version,
      packagesUrl: buildStableAptPackagesUrl(aptRepoUrl),
      error: getErrorMessage(error),
    });
    return version;
  }
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
    getAgentArtifactRoots().linuxAgentBuildRoot,
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
    downloadPath: `/api/agent/linux/packages/${encodeURIComponent(version)}`,
  };
}
