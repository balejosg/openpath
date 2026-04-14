import fs from 'node:fs';
import path from 'node:path';

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

export interface AgentArtifactRoots {
  windowsAgentRoot: string;
  sharedRuntimeRoot: string;
  linuxAgentBuildRoot: string;
  windowsAgentVersionFile: string;
  firefoxExtensionRoot: string;
  firefoxReleaseRoot: string;
  chromiumManagedRoot: string;
}

function resolveArtifactRoot(envVarName: string, fallbackPath: string): string {
  const configuredPath = process.env[envVarName]?.trim();
  if (!configuredPath) {
    return fallbackPath;
  }

  return path.resolve(configuredPath);
}

export function getAgentArtifactRoots(): AgentArtifactRoots {
  const windowsAgentRoot = resolveArtifactRoot(
    'OPENPATH_WINDOWS_AGENT_ROOT',
    path.resolve(process.cwd(), '../windows')
  );
  const sharedRuntimeRoot = resolveArtifactRoot(
    'OPENPATH_SHARED_RUNTIME_ROOT',
    path.resolve(process.cwd(), '../runtime')
  );
  const linuxAgentBuildRoot = resolveArtifactRoot(
    'OPENPATH_LINUX_AGENT_BUILD_ROOT',
    path.resolve(process.cwd(), '../build')
  );
  const windowsAgentVersionFile = resolveArtifactRoot(
    'OPENPATH_AGENT_VERSION_FILE',
    path.resolve(process.cwd(), '../VERSION')
  );
  const firefoxExtensionRoot = resolveArtifactRoot(
    'OPENPATH_FIREFOX_EXTENSION_ROOT',
    path.resolve(process.cwd(), '../firefox-extension')
  );
  const firefoxReleaseRoot = resolveArtifactRoot(
    'OPENPATH_FIREFOX_RELEASE_ROOT',
    path.join(firefoxExtensionRoot, 'build', 'firefox-release')
  );
  const chromiumManagedRoot = resolveArtifactRoot(
    'OPENPATH_CHROMIUM_MANAGED_ROOT',
    path.join(firefoxExtensionRoot, 'build', 'chromium-managed')
  );

  return {
    windowsAgentRoot,
    sharedRuntimeRoot,
    linuxAgentBuildRoot,
    windowsAgentVersionFile,
    firefoxExtensionRoot,
    firefoxReleaseRoot,
    chromiumManagedRoot,
  };
}

export function getFirefoxReleaseMetadataFile(): string {
  return path.join(getAgentArtifactRoots().firefoxReleaseRoot, 'metadata.json');
}

export function getFirefoxReleaseXpiFile(): string {
  return path.join(getAgentArtifactRoots().firefoxReleaseRoot, 'openpath-firefox-extension.xpi');
}

export function getChromiumManagedMetadataFile(): string {
  return path.join(getAgentArtifactRoots().chromiumManagedRoot, 'metadata.json');
}

export function getChromiumManagedCrxFile(): string {
  return path.join(getAgentArtifactRoots().chromiumManagedRoot, 'openpath-chromium-extension.crx');
}

export function readServerVersion(): string {
  const envVersion = process.env.OPENPATH_VERSION?.trim();
  if (envVersion) {
    return envVersion;
  }

  try {
    const fileVersion = fs
      .readFileSync(getAgentArtifactRoots().windowsAgentVersionFile, 'utf8')
      .trim();
    if (fileVersion) {
      return fileVersion;
    }
  } catch {
    // Best-effort fallback; missing version file should not break runtime.
  }

  return '0.0.0';
}
