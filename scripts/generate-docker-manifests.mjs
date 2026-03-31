import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
export const projectRoot = resolve(dirname(scriptPath), '..');

export const DOCKER_MANIFEST_CASES = [
  {
    packagePath: 'package.json',
    dockerPackagePath: 'package.docker.json',
    keys: [
      'name',
      'private',
      'version',
      'license',
      'type',
      'workspaces',
      'engines',
      'packageManager',
      'overrides',
      'devDependencies',
    ],
  },
  {
    packagePath: 'api/package.json',
    dockerPackagePath: 'api/package.docker.json',
    keys: [
      'name',
      'version',
      'license',
      'type',
      'main',
      'types',
      'exports',
      'engines',
      'dependencies',
      'devDependencies',
    ],
  },
  {
    packagePath: 'shared/package.json',
    dockerPackagePath: 'shared/package.docker.json',
    keys: [
      'name',
      'version',
      'license',
      'type',
      'main',
      'types',
      'exports',
      'engines',
      'dependencies',
      'devDependencies',
    ],
  },
  {
    packagePath: 'react-spa/package.json',
    dockerPackagePath: 'react-spa/package.docker.json',
    keys: ['name', 'private', 'version', 'type', 'dependencies', 'devDependencies'],
  },
];

function readJson(rootDir, relativePath) {
  return JSON.parse(readFileSync(resolve(rootDir, relativePath), 'utf8'));
}

export function projectPackage(pkg, keys) {
  return Object.fromEntries(
    keys.filter((key) => Object.hasOwn(pkg, key)).map((key) => [key, pkg[key]])
  );
}

export function buildDockerManifest(rootDir, manifestCase) {
  return projectPackage(readJson(rootDir, manifestCase.packagePath), manifestCase.keys);
}

export function formatDockerManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function syncDockerManifests(rootDir = projectRoot, { check = false } = {}) {
  const changed = [];

  for (const manifestCase of DOCKER_MANIFEST_CASES) {
    const targetPath = resolve(rootDir, manifestCase.dockerPackagePath);
    const nextContent = formatDockerManifest(buildDockerManifest(rootDir, manifestCase));
    const currentContent = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : '';

    if (currentContent === nextContent) {
      continue;
    }

    changed.push(manifestCase.dockerPackagePath);

    if (!check) {
      writeFileSync(targetPath, nextContent);
    }
  }

  return changed;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const changed = syncDockerManifests(projectRoot, { check: process.argv.includes('--check') });

  if (changed.length === 0) {
    process.exit(0);
  }

  if (process.argv.includes('--check')) {
    console.error(`Docker manifests are out of date: ${changed.join(', ')}`);
    process.exit(1);
  }

  console.log(`Updated Docker manifests: ${changed.join(', ')}`);
}
