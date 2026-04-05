/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Token Delivery REST API Tests
 *
 * Tests for machine registration and tokenized whitelist download.
 * Run with: npm run test:token-delivery
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeSlug } from '@openpath/shared';
import {
  bearerAuth,
  getAvailablePort,
  resetDb,
  trpcMutate as _trpcMutate,
  parseTRPC,
} from './test-utils.js';
import { closeConnection, db } from '../src/db/index.js';
import { clearLinuxAgentAptMetadataCache } from '../src/lib/server-assets.js';
import { sql } from 'drizzle-orm';

let PORT: number;
let API_URL: string;
let server: Server | undefined;
let registrationToken: string;
let adminEmail: string;
let adminPassword: string;

const currentFilePath = fileURLToPath(import.meta.url);
const apiTestsDir = dirname(currentFilePath);
const apiRoot = resolve(apiTestsDir, '..');
const serverVersionFilePath = resolve(apiRoot, '../VERSION');
const linuxAgentVersion = readFileSync(serverVersionFilePath, 'utf8').trim() || '0.0.0';
const linuxAgentBuildRoot = resolve(apiRoot, '../build');
const linuxAgentPackageFileName = `openpath-dnsmasq_${linuxAgentVersion}-1_amd64.deb`;
const linuxAgentPackageFilePath = resolve(linuxAgentBuildRoot, linuxAgentPackageFileName);
const firefoxExtensionRoot = resolve(apiRoot, '../firefox-extension');
const firefoxReleaseBuildRoot = resolve(firefoxExtensionRoot, 'build/firefox-release');
const firefoxReleaseMetadataPath = resolve(firefoxReleaseBuildRoot, 'metadata.json');
const firefoxReleaseXpiPath = resolve(firefoxReleaseBuildRoot, 'openpath-firefox-extension.xpi');
const chromiumManagedBuildRoot = resolve(firefoxExtensionRoot, 'build/chromium-managed');
const chromiumManagedMetadataPath = resolve(chromiumManagedBuildRoot, 'metadata.json');
const chromiumManagedCrxPath = resolve(chromiumManagedBuildRoot, 'openpath-chromium-extension.crx');

const GLOBAL_TIMEOUT = setTimeout(() => {
  console.error('\n❌ Token delivery tests timed out! Forcing exit...');
  process.exit(1);
}, 30000);
GLOBAL_TIMEOUT.unref();

const trpcMutate = (procedure: string, input: unknown): Promise<Response> =>
  _trpcMutate(API_URL, procedure, input);

function mockStableAptPackagesManifest(content: string): () => void {
  const originalFetch = globalThis.fetch;
  clearLinuxAgentAptMetadataCache();

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);

    if (url.endsWith('/dists/stable/main/binary-amd64/Packages')) {
      return new Response(content, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    return originalFetch(input, init);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
    clearLinuxAgentAptMetadataCache();
  };
}

async function getEnrollmentToken(classroomId: string): Promise<string> {
  const loginResponse = await trpcMutate('auth.login', {
    email: adminEmail,
    password: adminPassword,
  });
  assert.strictEqual(loginResponse.status, 200);

  const loginParsed = await parseTRPC(loginResponse);
  const loginData = loginParsed.data as { accessToken?: string };
  assert.ok(loginData.accessToken);

  const ticketResponse = await fetch(`${API_URL}/api/enroll/${classroomId}/ticket`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${loginData.accessToken}`,
    },
  });
  assert.strictEqual(ticketResponse.status, 200);

  const ticketData = (await ticketResponse.json()) as {
    success: boolean;
    enrollmentToken?: string;
  };
  assert.strictEqual(ticketData.success, true);
  assert.ok(ticketData.enrollmentToken);

  return ticketData.enrollmentToken;
}

async function ensureGroupExists(groupId: string): Promise<void> {
  await db.execute(
    sql.raw(`
        INSERT INTO whitelist_groups (id, name, display_name) VALUES ('${groupId}', '${groupId}', '${groupId}')
        ON CONFLICT (id) DO NOTHING
    `)
  );
}

async function createTestClassroom(name: string, groupId: string): Promise<string> {
  await ensureGroupExists(groupId);
  const id = `classroom-${String(Date.now())}`;
  const slug = sanitizeSlug(name, { maxLength: 100, allowUnderscore: true });
  await db.execute(
    sql.raw(`
        INSERT INTO classrooms (id, name, display_name, default_group_id, active_group_id)
        VALUES ('${id}', '${slug}', '${name}', '${groupId}', '${groupId}')
    `)
  );
  return id;
}

function extractMachineToken(whitelistUrl: string): string {
  const match = /\/w\/([^/]+)\//.exec(whitelistUrl);
  assert.ok(match, `Expected tokenized whitelist URL, got: ${whitelistUrl}`);
  const token = match[1];
  assert.ok(token, `Expected machine token in URL: ${whitelistUrl}`);
  return token;
}

void describe('Token Delivery REST API Tests', { timeout: 30000 }, async () => {
  before(async () => {
    await resetDb();

    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);
    process.env.SHARED_SECRET = 'test-shared-secret';

    const { app } = await import('../src/server.js');
    server = app.listen(PORT, () => {
      console.log(`Token delivery test server started on port ${String(PORT)}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    adminEmail = `token-admin-${String(Date.now())}@example.com`;
    adminPassword = 'SecurePassword123!';
    const adminData = {
      email: adminEmail,
      name: 'Token Test Admin',
      password: adminPassword,
    };

    const response = await trpcMutate('setup.createFirstAdmin', adminData);
    const res = await parseTRPC(response);
    const data = res.data as { registrationToken: string };
    registrationToken = data.registrationToken;
  });

  after(async () => {
    await resetDb();
    rmSync(linuxAgentBuildRoot, { recursive: true, force: true });
    rmSync(firefoxReleaseBuildRoot, { recursive: true, force: true });
    rmSync(chromiumManagedBuildRoot, { recursive: true, force: true });

    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          console.log('Token delivery test server closed');
          resolve();
        });
      });
    }
    await closeConnection();
  });

  await describe('POST /api/setup/validate-token', async () => {
    await test('should validate correct registration token', async () => {
      const response = await fetch(`${API_URL}/api/setup/validate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: registrationToken }),
      });

      assert.strictEqual(response.status, 200);
      const data = (await response.json()) as { valid: boolean };
      assert.strictEqual(data.valid, true);
    });

    await test('should reject invalid registration token', async () => {
      const response = await fetch(`${API_URL}/api/setup/validate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid-token' }),
      });

      assert.strictEqual(response.status, 200);
      const data = (await response.json()) as { valid: boolean };
      assert.strictEqual(data.valid, false);
    });

    await test('should return false for missing token', async () => {
      const response = await fetch(`${API_URL}/api/setup/validate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(response.status, 200);
      const data = (await response.json()) as { valid: boolean };
      assert.strictEqual(data.valid, false);
    });
  });

  await describe('POST /api/machines/register', async () => {
    beforeEach(async () => {
      await db.execute(sql.raw('DELETE FROM machines'));
    });

    await test('should register machine and return tokenized URL', async () => {
      await createTestClassroom('TestClassroom', 'test-group');

      const response = await fetch(`${API_URL}/api/machines/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${registrationToken}`,
        },
        body: JSON.stringify({
          hostname: 'test-pc-001',
          classroomName: 'TestClassroom',
          version: '1.0.0',
        }),
      });

      assert.strictEqual(response.status, 200);
      const data = (await response.json()) as { success: boolean; whitelistUrl: string };
      assert.strictEqual(data.success, true);
      assert.ok(data.whitelistUrl.includes('/w/'));
      assert.ok(data.whitelistUrl.includes('/whitelist.txt'));
    });

    await test('should reject without authorization header', async () => {
      const response = await fetch(`${API_URL}/api/machines/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostname: 'test-pc-001',
          classroomName: 'TestClassroom',
        }),
      });

      assert.strictEqual(response.status, 401);
    });

    await test('should reject invalid registration token', async () => {
      const response = await fetch(`${API_URL}/api/machines/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token',
        },
        body: JSON.stringify({
          hostname: 'test-pc-001',
          classroomName: 'TestClassroom',
        }),
      });

      assert.strictEqual(response.status, 403);
    });

    await test('should reject missing hostname', async () => {
      const response = await fetch(`${API_URL}/api/machines/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${registrationToken}`,
        },
        body: JSON.stringify({
          classroomName: 'TestClassroom',
        }),
      });

      assert.strictEqual(response.status, 400);
    });

    await test('should reject non-existent classroom', async () => {
      const response = await fetch(`${API_URL}/api/machines/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${registrationToken}`,
        },
        body: JSON.stringify({
          hostname: 'test-pc-001',
          classroomName: 'NonExistentClassroom',
        }),
      });

      assert.strictEqual(response.status, 404);
    });
  });

  await describe('POST /api/machines/:hostname/rotate-download-token', async () => {
    let machineHostname: string;
    let machineToken: string;

    before(async () => {
      await createTestClassroom('RotateTestClassroom', 'rotate-group');

      const response = await fetch(`${API_URL}/api/machines/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${registrationToken}`,
        },
        body: JSON.stringify({
          hostname: 'rotate-test-pc',
          classroomName: 'RotateTestClassroom',
        }),
      });

      assert.strictEqual(response.status, 200);
      const data = (await response.json()) as {
        machineHostname?: string;
        reportedHostname?: string;
        whitelistUrl?: string;
      };
      assert.ok(data.machineHostname, 'register should return canonical machineHostname');
      assert.strictEqual(data.reportedHostname, 'rotate-test-pc');
      machineHostname = data.machineHostname;
      assert.ok(data.whitelistUrl);
      machineToken = extractMachineToken(data.whitelistUrl);
    });

    await test('should rotate token and return new URL', async () => {
      const response = await fetch(
        `${API_URL}/api/machines/${machineHostname}/rotate-download-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${machineToken}`,
          },
        }
      );

      assert.strictEqual(response.status, 200);
      const data = (await response.json()) as { success: boolean; whitelistUrl: string };
      assert.strictEqual(data.success, true);
      assert.ok(data.whitelistUrl.includes('/w/'));
    });

    await test('should reject without authorization', async () => {
      const response = await fetch(
        `${API_URL}/api/machines/${machineHostname}/rotate-download-token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      assert.strictEqual(response.status, 401);
    });

    await test('should reject invalid machine token', async () => {
      const response = await fetch(
        `${API_URL}/api/machines/${machineHostname}/rotate-download-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer wrong-secret',
          },
        }
      );

      assert.strictEqual(response.status, 403);
    });

    await test('should reject hostname mismatches even with a valid machine token', async () => {
      const response = await fetch(
        `${API_URL}/api/machines/non-existent-pc/rotate-download-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${machineToken}`,
          },
        }
      );

      assert.strictEqual(response.status, 403);
    });
  });

  await describe('GET /api/agent/windows/*', async () => {
    let machineToken: string;

    before(async () => {
      await createTestClassroom('WindowsAgentClassroom', 'windows-agent-group');

      const registerResponse = await fetch(`${API_URL}/api/machines/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${registrationToken}`,
        },
        body: JSON.stringify({
          hostname: 'windows-agent-test-pc',
          classroomName: 'WindowsAgentClassroom',
          version: '4.0.0',
        }),
      });

      assert.strictEqual(registerResponse.status, 200);
      const registerData = (await registerResponse.json()) as { whitelistUrl: string };
      machineToken = extractMachineToken(registerData.whitelistUrl);
    });

    await test('should require machine bearer token for manifest', async () => {
      const response = await fetch(`${API_URL}/api/agent/windows/latest.json`);
      assert.strictEqual(response.status, 401);
    });

    await test('should return manifest using server version and file hashes', async () => {
      const response = await fetch(`${API_URL}/api/agent/windows/latest.json`, {
        headers: {
          Authorization: `Bearer ${machineToken}`,
        },
      });

      assert.strictEqual(response.status, 200);
      const data = (await response.json()) as {
        success: boolean;
        version: string;
        files: { path: string; sha256: string; size: number }[];
      };

      assert.strictEqual(data.success, true);
      assert.ok(data.version.length > 0);
      assert.ok(data.files.length > 0);
      assert.ok(data.files.some((file) => file.path === 'scripts/Update-OpenPath.ps1'));
      assert.ok(data.files.every((file) => file.sha256.length === 64));
    });

    await test('should download manifest file by relative path', async () => {
      const manifestResponse = await fetch(`${API_URL}/api/agent/windows/latest.json`, {
        headers: {
          Authorization: `Bearer ${machineToken}`,
        },
      });
      assert.strictEqual(manifestResponse.status, 200);

      const manifest = (await manifestResponse.json()) as {
        files: { path: string }[];
      };
      const filePath = manifest.files[0]?.path;
      assert.ok(filePath);

      const response = await fetch(
        `${API_URL}/api/agent/windows/file?path=${encodeURIComponent(filePath)}`,
        {
          headers: {
            Authorization: `Bearer ${machineToken}`,
          },
        }
      );

      assert.strictEqual(response.status, 200);
      const fileContent = await response.text();
      assert.ok(fileContent.length > 0);
    });

    await test('should include Firefox browser extension assets in the Windows agent manifest', async () => {
      const response = await fetch(`${API_URL}/api/agent/windows/latest.json`, {
        headers: {
          Authorization: `Bearer ${machineToken}`,
        },
      });

      assert.strictEqual(response.status, 200);
      const data = (await response.json()) as {
        success: boolean;
        files: { path: string; sha256: string; size: number }[];
      };

      assert.strictEqual(data.success, true);
      assert.ok(data.files.some((file) => file.path === 'browser-extension/firefox/manifest.json'));
      assert.ok(
        data.files.some((file) => file.path === 'browser-extension/firefox/dist/background.js')
      );
      assert.ok(
        data.files.some((file) => file.path === 'browser-extension/firefox/popup/popup.html')
      );
    });
  });

  await describe('GET /api/agent/linux/*', async () => {
    let machineToken: string;
    let classroomId: string;

    before(async () => {
      classroomId = await createTestClassroom('LinuxAgentClassroom', 'linux-agent-group');

      mkdirSync(linuxAgentBuildRoot, { recursive: true });
      writeFileSync(linuxAgentPackageFilePath, 'fake-linux-agent-package');

      const registerResponse = await fetch(`${API_URL}/api/machines/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${registrationToken}`,
        },
        body: JSON.stringify({
          hostname: 'linux-agent-test-pc',
          classroomName: 'LinuxAgentClassroom',
          version: '1.0.0',
        }),
      });

      assert.strictEqual(registerResponse.status, 200);
      const registerData = (await registerResponse.json()) as { whitelistUrl: string };
      machineToken = extractMachineToken(registerData.whitelistUrl);
    });

    await test('should require machine bearer token for linux manifest', async () => {
      const response = await fetch(`${API_URL}/api/agent/linux/latest.json`);
      assert.strictEqual(response.status, 401);
    });

    await test('should return linux package metadata and hash from the API manifest', async () => {
      const response = await fetch(`${API_URL}/api/agent/linux/latest.json`, {
        headers: {
          Authorization: `Bearer ${machineToken}`,
        },
      });

      assert.strictEqual(response.status, 200);
      const data = (await response.json()) as {
        success: boolean;
        version: string;
        packageFileName: string;
        sha256: string;
        size: number;
        minSupportedVersion: string;
        minDirectUpgradeVersion: string;
        downloadPath: string;
      };

      assert.strictEqual(data.success, true);
      assert.strictEqual(data.version, linuxAgentVersion);
      assert.strictEqual(data.packageFileName, linuxAgentPackageFileName);
      assert.strictEqual(data.size, 'fake-linux-agent-package'.length);
      assert.strictEqual(data.sha256.length, 64);
      assert.ok(data.minSupportedVersion.length > 0);
      assert.ok(data.minDirectUpgradeVersion.length > 0);
      assert.ok(
        data.downloadPath.includes(
          `/api/agent/linux/package?version=${encodeURIComponent(data.version)}`
        )
      );
    });

    await test('should include configured bridge versions in the linux API manifest', async () => {
      process.env.OPENPATH_LINUX_AGENT_BRIDGE_VERSIONS = '3.8.0, 3.9.0';

      try {
        const response = await fetch(`${API_URL}/api/agent/linux/latest.json`, {
          headers: {
            Authorization: `Bearer ${machineToken}`,
          },
        });

        assert.strictEqual(response.status, 200);
        const data = (await response.json()) as {
          bridgeVersions: string[];
        };

        assert.deepStrictEqual(data.bridgeVersions, ['3.8.0', '3.9.0']);
      } finally {
        delete process.env.OPENPATH_LINUX_AGENT_BRIDGE_VERSIONS;
      }
    });

    await test('should prefer OPENPATH_LINUX_AGENT_VERSION over the server version for linux manifests', async () => {
      const pinnedVersion = '9.9.9';
      const pinnedPackageFileName = `openpath-dnsmasq_${pinnedVersion}-1_amd64.deb`;
      const pinnedPackageFilePath = resolve(linuxAgentBuildRoot, pinnedPackageFileName);
      const originalPinnedVersion = process.env.OPENPATH_LINUX_AGENT_VERSION;

      writeFileSync(pinnedPackageFilePath, 'fake-linux-pinned-package');
      process.env.OPENPATH_LINUX_AGENT_VERSION = pinnedVersion;

      try {
        const response = await fetch(`${API_URL}/api/agent/linux/latest.json`, {
          headers: {
            Authorization: `Bearer ${machineToken}`,
          },
        });

        assert.strictEqual(response.status, 200);
        const data = (await response.json()) as {
          version: string;
          packageFileName: string;
          downloadPath: string;
        };

        assert.strictEqual(data.version, pinnedVersion);
        assert.strictEqual(data.packageFileName, pinnedPackageFileName);
        assert.ok(
          data.downloadPath.includes(
            `/api/agent/linux/package?version=${encodeURIComponent(pinnedVersion)}`
          )
        );
      } finally {
        rmSync(pinnedPackageFilePath, { force: true });
        if (originalPinnedVersion === undefined) {
          delete process.env.OPENPATH_LINUX_AGENT_VERSION;
        } else {
          process.env.OPENPATH_LINUX_AGENT_VERSION = originalPinnedVersion;
        }
      }
    });

    await test('should download the linux agent package through the API path', async () => {
      const manifestResponse = await fetch(`${API_URL}/api/agent/linux/latest.json`, {
        headers: {
          Authorization: `Bearer ${machineToken}`,
        },
      });
      assert.strictEqual(manifestResponse.status, 200);

      const manifest = (await manifestResponse.json()) as {
        downloadPath: string;
      };
      assert.ok(manifest.downloadPath);

      const response = await fetch(`${API_URL}${manifest.downloadPath}`, {
        headers: {
          Authorization: `Bearer ${machineToken}`,
        },
      });

      assert.strictEqual(response.status, 200);
      const packageContent = await response.text();
      assert.strictEqual(packageContent, 'fake-linux-agent-package');
    });

    await test('should download a specific bridge package version when it is available', async () => {
      const bridgeVersion = '3.9.0';
      const bridgePackageFileName = `openpath-dnsmasq_${bridgeVersion}-1_amd64.deb`;
      const bridgePackageFilePath = resolve(linuxAgentBuildRoot, bridgePackageFileName);
      writeFileSync(bridgePackageFilePath, 'fake-linux-bridge-package');

      const response = await fetch(
        `${API_URL}/api/agent/linux/package?version=${encodeURIComponent(bridgeVersion)}`,
        {
          headers: {
            Authorization: `Bearer ${machineToken}`,
          },
        }
      );

      assert.strictEqual(response.status, 200);
      const packageContent = await response.text();
      assert.strictEqual(packageContent, 'fake-linux-bridge-package');
    });

    await test('should pin the configured linux package version in enrollment bootstrap scripts when APT still advertises it', async () => {
      const originalPinnedVersion = process.env.OPENPATH_LINUX_AGENT_VERSION;
      const restoreFetch = mockStableAptPackagesManifest(`
Package: openpath-dnsmasq
Version: 9.9.9-1
`);
      process.env.OPENPATH_LINUX_AGENT_VERSION = '9.9.9';

      try {
        const enrollmentToken = await getEnrollmentToken(classroomId);
        const response = await fetch(`${API_URL}/api/enroll/${classroomId}`, {
          headers: {
            Authorization: `Bearer ${enrollmentToken}`,
          },
        });

        assert.strictEqual(response.status, 200);
        const body = await response.text();

        assert.match(body, /LINUX_AGENT_VERSION='9\.9\.9'/);
        assert.match(body, /--package-version "\$LINUX_AGENT_VERSION"/);
      } finally {
        restoreFetch();
        if (originalPinnedVersion === undefined) {
          delete process.env.OPENPATH_LINUX_AGENT_VERSION;
        } else {
          process.env.OPENPATH_LINUX_AGENT_VERSION = originalPinnedVersion;
        }
      }
    });

    await test('should omit stale linux package pins from enrollment bootstrap scripts when APT no longer advertises them', async () => {
      const originalPinnedVersion = process.env.OPENPATH_LINUX_AGENT_VERSION;
      const restoreFetch = mockStableAptPackagesManifest(`
Package: openpath-dnsmasq
Version: 4.1.10-1
`);
      process.env.OPENPATH_LINUX_AGENT_VERSION = '4.1.9';

      try {
        const enrollmentToken = await getEnrollmentToken(classroomId);
        const response = await fetch(`${API_URL}/api/enroll/${classroomId}`, {
          headers: {
            Authorization: `Bearer ${enrollmentToken}`,
          },
        });

        assert.strictEqual(response.status, 200);
        const body = await response.text();

        assert.doesNotMatch(body, /LINUX_AGENT_VERSION='4\.1\.9'/);
        assert.doesNotMatch(body, /--package-version "\$LINUX_AGENT_VERSION"/);
        assert.match(body, /bootstrap_cmd=\(bash "\$tmpfile" --api-url "\$API_URL"/);
      } finally {
        restoreFetch();
        if (originalPinnedVersion === undefined) {
          delete process.env.OPENPATH_LINUX_AGENT_VERSION;
        } else {
          process.env.OPENPATH_LINUX_AGENT_VERSION = originalPinnedVersion;
        }
      }
    });
  });

  await describe('Windows classroom bootstrap endpoints', async () => {
    let enrollmentToken: string;
    let classroomId: string;

    before(async () => {
      classroomId = await createTestClassroom(
        'WindowsBootstrapClassroom',
        'windows-bootstrap-group'
      );
      enrollmentToken = await getEnrollmentToken(classroomId);
    });

    await test('should return Windows enrollment script with enrollment token auth', async () => {
      const response = await fetch(`${API_URL}/api/enroll/${classroomId}/windows.ps1`, {
        headers: {
          Authorization: `Bearer ${enrollmentToken}`,
        },
      });

      assert.strictEqual(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /text\/x-powershell/);
      const body = await response.text();
      assert.match(body, /Install-OpenPath\.ps1/);
      assert.match(body, /bootstrap\/latest\.json/);
      assert.match(body, /-EnrollmentToken/);
      assert.match(body, /-ClassroomId/);
      assert.match(body, /\$installExitCode\s*=\s*0/);
      assert.match(
        body,
        /if\s*\(\$installExitCode\s*-ne\s*0\)\s*\{\s*exit \$installExitCode\s*\}/s
      );
    });

    await test('should reject Windows enrollment script with mismatched classroom', async () => {
      const otherClassroomId = await createTestClassroom(
        'WindowsBootstrapMismatchClassroom',
        'windows-bootstrap-mismatch-group'
      );

      const response = await fetch(`${API_URL}/api/enroll/${otherClassroomId}/windows.ps1`, {
        headers: {
          Authorization: `Bearer ${enrollmentToken}`,
        },
      });

      assert.strictEqual(response.status, 403);
    });

    await test('should require enrollment token for bootstrap manifest', async () => {
      const response = await fetch(`${API_URL}/api/agent/windows/bootstrap/latest.json`);
      assert.strictEqual(response.status, 401);
    });

    await test('should return bootstrap manifest and files for enrollment token', async () => {
      const manifestResponse = await fetch(`${API_URL}/api/agent/windows/bootstrap/latest.json`, {
        headers: {
          Authorization: `Bearer ${enrollmentToken}`,
        },
      });

      assert.strictEqual(manifestResponse.status, 200);
      const manifest = (await manifestResponse.json()) as {
        success: boolean;
        files: { path: string; sha256: string; size: number }[];
      };

      assert.strictEqual(manifest.success, true);
      assert.ok(manifest.files.some((file) => file.path === 'Install-OpenPath.ps1'));
      assert.ok(manifest.files.some((file) => file.path === 'scripts/Pre-Install-Validation.ps1'));
      assert.ok(manifest.files.some((file) => file.path === 'scripts/Enroll-Machine.ps1'));

      const fileResponse = await fetch(
        `${API_URL}/api/agent/windows/bootstrap/file?path=${encodeURIComponent('Install-OpenPath.ps1')}`,
        {
          headers: {
            Authorization: `Bearer ${enrollmentToken}`,
          },
        }
      );

      assert.strictEqual(fileResponse.status, 200);
      const fileText = await fileResponse.text();
      assert.match(fileText, /OpenPath DNS para Windows - Instalador/);

      const preflightResponse = await fetch(
        `${API_URL}/api/agent/windows/bootstrap/file?path=${encodeURIComponent('scripts/Pre-Install-Validation.ps1')}`,
        {
          headers: {
            Authorization: `Bearer ${enrollmentToken}`,
          },
        }
      );

      assert.strictEqual(preflightResponse.status, 200);
      const preflightText = await preflightResponse.text();
      assert.match(preflightText, /OpenPath Pre-Installation Validation/);
    });

    await test('should include Firefox extension assets in the Windows bootstrap manifest', async () => {
      const manifestResponse = await fetch(`${API_URL}/api/agent/windows/bootstrap/latest.json`, {
        headers: {
          Authorization: `Bearer ${enrollmentToken}`,
        },
      });

      assert.strictEqual(manifestResponse.status, 200);
      const manifest = (await manifestResponse.json()) as {
        success: boolean;
        files: { path: string; sha256: string; size: number }[];
      };

      assert.strictEqual(manifest.success, true);
      assert.ok(
        manifest.files.some((file) => file.path === 'browser-extension/firefox/manifest.json')
      );
      assert.ok(
        manifest.files.some((file) => file.path === 'browser-extension/firefox/dist/background.js')
      );
    });

    await test('should include signed Firefox release artifacts in the Windows bootstrap manifest when available', async () => {
      mkdirSync(firefoxReleaseBuildRoot, { recursive: true });
      writeFileSync(
        firefoxReleaseMetadataPath,
        JSON.stringify({
          extensionId: 'monitor-bloqueos@openpath',
          version: '2.0.0',
        })
      );
      writeFileSync(firefoxReleaseXpiPath, 'fake-signed-firefox-xpi');

      const manifestResponse = await fetch(`${API_URL}/api/agent/windows/bootstrap/latest.json`, {
        headers: {
          Authorization: `Bearer ${enrollmentToken}`,
        },
      });

      assert.strictEqual(manifestResponse.status, 200);
      const manifest = (await manifestResponse.json()) as {
        success: boolean;
        files: { path: string; sha256: string; size: number }[];
      };

      assert.strictEqual(manifest.success, true);
      assert.ok(
        manifest.files.some(
          (file) => file.path === 'browser-extension/firefox-release/metadata.json'
        )
      );
      assert.ok(
        manifest.files.some(
          (file) => file.path === 'browser-extension/firefox-release/openpath-firefox-extension.xpi'
        )
      );
    });

    await test('should include Windows Firefox native host runtime files in the bootstrap manifest', async () => {
      const manifestResponse = await fetch(`${API_URL}/api/agent/windows/bootstrap/latest.json`, {
        headers: {
          Authorization: `Bearer ${enrollmentToken}`,
        },
      });

      assert.strictEqual(manifestResponse.status, 200);
      const manifest = (await manifestResponse.json()) as {
        success: boolean;
        files: { path: string; sha256: string; size: number }[];
      };

      assert.strictEqual(manifest.success, true);
      assert.ok(manifest.files.some((file) => file.path === 'scripts/OpenPath-NativeHost.ps1'));
      assert.ok(manifest.files.some((file) => file.path === 'scripts/OpenPath-NativeHost.cmd'));
    });

    await test('should publish Firefox release XPI endpoint when signed artifacts exist', async () => {
      mkdirSync(firefoxReleaseBuildRoot, { recursive: true });
      writeFileSync(
        firefoxReleaseMetadataPath,
        JSON.stringify({
          extensionId: 'monitor-bloqueos@openpath',
          version: '2.0.0.23002',
        })
      );
      writeFileSync(firefoxReleaseXpiPath, 'fake-firefox-release-xpi');

      const xpiResponse = await fetch(`${API_URL}/api/extensions/firefox/openpath.xpi`);
      assert.strictEqual(xpiResponse.status, 200);
      assert.match(
        xpiResponse.headers.get('content-type') ?? '',
        /application\/x-xpinstall|application\/x-xpinstall;|application\/octet-stream/
      );
      assert.strictEqual(await xpiResponse.text(), 'fake-firefox-release-xpi');
    });

    await test('should publish Chromium managed rollout endpoints when build artifacts exist', async () => {
      mkdirSync(chromiumManagedBuildRoot, { recursive: true });
      writeFileSync(
        chromiumManagedMetadataPath,
        JSON.stringify({
          extensionId: 'abcdefghijklmnopabcdefghijklmnop',
          version: '2.0.0',
        })
      );
      writeFileSync(chromiumManagedCrxPath, 'fake-crx-payload');

      const manifestResponse = await fetch(`${API_URL}/api/extensions/chromium/updates.xml`);
      assert.strictEqual(manifestResponse.status, 200);
      assert.match(manifestResponse.headers.get('content-type') ?? '', /xml/);
      const xmlBody = await manifestResponse.text();
      assert.match(xmlBody, /abcdefghijklmnopabcdefghijklmnop/);
      assert.match(xmlBody, /openpath\.crx/);
      assert.match(xmlBody, /version="2\.0\.0"/);

      const crxResponse = await fetch(`${API_URL}/api/extensions/chromium/openpath.crx`);
      assert.strictEqual(crxResponse.status, 200);
      assert.match(
        crxResponse.headers.get('content-type') ?? '',
        /application\/x-chrome-extension|application\/octet-stream/
      );
      assert.strictEqual(await crxResponse.text(), 'fake-crx-payload');
    });
  });

  await describe('GET /w/:machineToken/whitelist.txt', async () => {
    let machineToken: string;

    before(async () => {
      await createTestClassroom('WhitelistETagClassroom', 'etag-group');

      const registerResponse = await fetch(`${API_URL}/api/machines/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${registrationToken}`,
        },
        body: JSON.stringify({
          hostname: 'etag-test-pc-001',
          classroomName: 'WhitelistETagClassroom',
          version: '1.0.0',
        }),
      });
      assert.strictEqual(registerResponse.status, 200);
      const registerData = (await registerResponse.json()) as { whitelistUrl: string };
      machineToken = extractMachineToken(registerData.whitelistUrl);
    });

    await test('should return ETag and support 304 for valid token', async () => {
      const response = await fetch(`${API_URL}/w/${machineToken}/whitelist.txt`);
      assert.strictEqual(response.status, 200);

      const etag = response.headers.get('etag');
      assert.ok(etag, 'Expected ETag header');

      const notModified = await fetch(`${API_URL}/w/${machineToken}/whitelist.txt`, {
        headers: {
          'If-None-Match': etag,
        },
      });
      assert.strictEqual(notModified.status, 304);

      const body = await notModified.text();
      assert.strictEqual(body, '');
    });

    await test('should reflect blocked subdomain rule changes immediately for machine-token downloads', async () => {
      const initial = await fetch(`${API_URL}/w/${machineToken}/whitelist.txt`);
      assert.strictEqual(initial.status, 200);
      const initialEtag = initial.headers.get('etag');
      assert.ok(initialEtag, 'Expected initial ETag header');
      const initialBody = await initial.text();
      assert.ok(!initialBody.includes('## BLOCKED-SUBDOMAINS'));

      const loginResponse = await trpcMutate('auth.login', {
        email: adminEmail,
        password: adminPassword,
      });
      assert.strictEqual(loginResponse.status, 200);
      const loginParsed = await parseTRPC(loginResponse);
      const loginData = loginParsed.data as { accessToken?: string };
      assert.ok(loginData.accessToken);

      const createRuleResponse = await _trpcMutate(
        API_URL,
        'groups.createRule',
        {
          groupId: 'etag-group',
          type: 'blocked_subdomain',
          value: 'cdn.token-delivery.example.com',
          comment: 'Token delivery blocked-subdomain regression',
        },
        bearerAuth(loginData.accessToken ?? null)
      );
      assert.strictEqual(createRuleResponse.status, 200);
      const createRuleParsed = await parseTRPC(createRuleResponse);
      const createRuleData = createRuleParsed.data as { id?: string };
      assert.ok(createRuleData.id);

      const updated = await fetch(`${API_URL}/w/${machineToken}/whitelist.txt`, {
        headers: {
          'If-None-Match': initialEtag,
        },
      });
      assert.strictEqual(updated.status, 200);

      const updatedEtag = updated.headers.get('etag');
      assert.ok(updatedEtag, 'Expected updated ETag header');
      assert.notStrictEqual(updatedEtag, initialEtag);

      const updatedBody = await updated.text();
      assert.ok(updatedBody.includes('## BLOCKED-SUBDOMAINS'));
      assert.ok(updatedBody.includes('cdn.token-delivery.example.com'));
    });

    await test('should return fail-open for invalid token', async () => {
      const response = await fetch(`${API_URL}/w/invalid-token-here/whitelist.txt`);

      assert.strictEqual(response.status, 200);
      const text = await response.text();
      assert.ok(text.includes('#DESACTIVADO'));
    });

    await test('should return fail-open for missing token', async () => {
      const response = await fetch(`${API_URL}/w/whitelist.txt`);
      const text = await response.text();
      assert.ok(text.includes('#DESACTIVADO') || response.status !== 200);
    });
  });

  await describe('GET /export/:name.txt', async () => {
    before(async () => {
      await createTestClassroom('ExportETagClassroom', 'etag-export-group');

      // Anonymous /export should only work for instance_public groups.
      await db.execute(
        sql.raw(`
          UPDATE whitelist_groups
          SET visibility = 'instance_public'
          WHERE name = 'etag-export-group'
        `)
      );
    });

    await test('should return ETag and support 304', async () => {
      const response = await fetch(`${API_URL}/export/etag-export-group.txt`);
      assert.strictEqual(response.status, 200);

      const etag = response.headers.get('etag');
      assert.ok(etag, 'Expected ETag header');

      const notModified = await fetch(`${API_URL}/export/etag-export-group.txt`, {
        headers: {
          'If-None-Match': etag,
        },
      });
      assert.strictEqual(notModified.status, 304);

      const body = await notModified.text();
      assert.strictEqual(body, '');
    });
  });
});
