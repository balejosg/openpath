import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import {
  getAgentArtifactRoots,
  getChromiumManagedMetadataFile,
  getFirefoxReleaseMetadataFile,
  getFirefoxReleaseXpiFile,
  type WindowsAgentFileEntry,
} from './server-asset-roots.js';

const WINDOWS_AGENT_DIRECTORIES = ['lib', 'scripts'] as const;
const WINDOWS_AGENT_RUNTIME_ROOT_FILES = ['OpenPath.ps1', 'Rotate-Token.ps1'] as const;
const WINDOWS_AGENT_BOOTSTRAP_ROOT_FILES = [
  'Install-OpenPath.ps1',
  'Uninstall-OpenPath.ps1',
  'OpenPath.ps1',
  'Rotate-Token.ps1',
] as const;
const FIREFOX_EXTENSION_DIRECTORIES = ['dist', 'popup', 'icons', 'blocked', 'native'] as const;

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

function normalizeManifestRelativePath(relativePath: string): string | null {
  const normalizedPath = relativePath.replaceAll('\\', '/');
  if (!normalizedPath || normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
    return null;
  }

  return normalizedPath;
}

export function buildWindowsAgentFileManifest(options?: {
  includeBootstrapFiles?: boolean;
}): WindowsAgentFileEntry[] {
  const roots = getAgentArtifactRoots();
  const rootFiles = options?.includeBootstrapFiles
    ? WINDOWS_AGENT_BOOTSTRAP_ROOT_FILES
    : WINDOWS_AGENT_RUNTIME_ROOT_FILES;
  const manifestSources = new Map<string, string>();
  const sharedFiles = [
    {
      relativePath: 'runtime/browser-policy-spec.json',
      absolutePath: path.join(roots.sharedRuntimeRoot, 'browser-policy-spec.json'),
    },
  ] as const;

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
    addManifestFile(fileName, path.join(roots.windowsAgentRoot, fileName));
  }

  for (const fileEntry of sharedFiles) {
    addManifestFile(fileEntry.relativePath, fileEntry.absolutePath);
  }

  for (const relativeDirectory of WINDOWS_AGENT_DIRECTORIES) {
    const absoluteDirectory = path.join(roots.windowsAgentRoot, relativeDirectory);
    addManifestDirectory(absoluteDirectory, relativeDirectory, /\.(ps1|psm1|cmd)$/i);
  }

  addManifestFile(
    'browser-extension/firefox/manifest.json',
    path.join(roots.firefoxExtensionRoot, 'manifest.json')
  );
  for (const relativeDirectory of FIREFOX_EXTENSION_DIRECTORIES) {
    addManifestDirectory(
      path.join(roots.firefoxExtensionRoot, relativeDirectory),
      path.posix.join('browser-extension/firefox', relativeDirectory)
    );
  }
  addManifestFile(
    'browser-extension/firefox-release/metadata.json',
    getFirefoxReleaseMetadataFile()
  );
  addManifestFile(
    'browser-extension/firefox-release/openpath-firefox-extension.xpi',
    getFirefoxReleaseXpiFile()
  );

  addManifestFile(
    'browser-extension/chromium-managed/metadata.json',
    getChromiumManagedMetadataFile()
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
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function resolveWindowsAgentManifestFile(
  relativePath: string,
  options?: { includeBootstrapFiles?: boolean }
): WindowsAgentFileEntry | null {
  const normalizedPath = normalizeManifestRelativePath(relativePath.trim());
  if (!normalizedPath) {
    return null;
  }

  return (
    buildWindowsAgentFileManifest(options).find((entry) => entry.relativePath === normalizedPath) ??
    null
  );
}
