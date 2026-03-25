import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const testsDir = dirname(currentFilePath);
const projectRoot = resolve(testsDir, '..');

function readPackageJson() {
  return JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(projectRoot, relativePath), 'utf8'));
}

function projectPackage(pkg, keys) {
  return Object.fromEntries(
    keys.filter((key) => Object.hasOwn(pkg, key)).map((key) => [key, pkg[key]])
  );
}

describe('repository verification contract', () => {
  test('verify:full runs coverage before unit, e2e, and security stages', () => {
    const packageJson = readPackageJson();
    const verifyFull = packageJson.scripts['verify:full'];

    assert.equal(
      verifyFull,
      'npm run verify:static && npm run verify:checks && npm run verify:coverage && npm run verify:unit && npm run e2e:full && npm run verify:security'
    );
  });

  test('pre-commit delegates coverage to verify:full instead of running it as a fourth step', () => {
    const hook = readFileSync(resolve(projectRoot, '.husky/pre-commit'), 'utf8');

    assert.ok(
      hook.includes('[3/3] Running full verification suite...'),
      'pre-commit should collapse coverage into the full verification step'
    );
    assert.ok(
      !hook.includes('npm run verify:coverage'),
      'pre-commit should not rerun verify:coverage after verify:full'
    );
    assert.ok(!hook.includes('[4/4]'), 'pre-commit should no longer advertise a fourth stage');
  });

  test('docker install manifests stay aligned with dependency-bearing package.json fields', () => {
    const cases = [
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

    for (const { packagePath, dockerPackagePath, keys } of cases) {
      assert.deepStrictEqual(
        readJson(dockerPackagePath),
        projectPackage(readJson(packagePath), keys),
        `${dockerPackagePath} should only contain dependency-relevant fields from ${packagePath}`
      );
    }
  });

  test('api Dockerfile uses dependency-only manifests and npm cache mounts', () => {
    const dockerfile = readFileSync(resolve(projectRoot, 'api/Dockerfile'), 'utf8');

    assert.ok(
      dockerfile.includes('# syntax=docker/dockerfile:1.7'),
      'api Dockerfile should opt into Dockerfile features required for cache mounts'
    );
    assert.ok(
      dockerfile.includes('COPY package.docker.json ./package.json'),
      'api Dockerfile should use the dependency-only root manifest during npm ci'
    );
    assert.ok(
      dockerfile.includes('COPY api/package.docker.json ./api/package.json'),
      'api Dockerfile should use the dependency-only api manifest during npm ci'
    );
    assert.ok(
      dockerfile.includes('COPY shared/package.docker.json ./shared/package.json'),
      'api Dockerfile should use the dependency-only shared manifest during npm ci'
    );
    assert.ok(
      dockerfile.includes('COPY react-spa/package.docker.json ./react-spa/package.json'),
      'api Dockerfile should use the dependency-only react-spa manifest during npm ci'
    );
    assert.ok(
      dockerfile.includes('--mount=type=cache,target=/root/.npm'),
      'api Dockerfile should cache npm downloads across repeated image builds'
    );
  });
});
