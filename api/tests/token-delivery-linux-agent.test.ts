import { after, before, describe, test } from 'node:test';
import assert from 'node:assert';
import { rmSync } from 'node:fs';

import { createFixtureClassroom } from './fixtures.js';
import { clearLinuxAgentAptMetadataCache } from '../src/lib/server-assets.js';
import {
  extractMachineToken,
  linuxAgentPackageFileName,
  mockAptPackagesManifest,
  mockStableAptPackagesManifest,
  startTokenDeliveryHarness,
  tokenDeliveryArtifacts,
  type TokenDeliveryHarness,
  writeLinuxAgentPackage,
} from './token-delivery-harness.js';

let harness: TokenDeliveryHarness;

void describe('Linux agent delivery', { timeout: 30000 }, async () => {
  before(async () => {
    harness = await startTokenDeliveryHarness();
  });

  after(async () => {
    await harness.close();
  });

  await describe('GET /api/agent/linux/*', async () => {
    let machineToken = '';
    let classroomId = '';

    before(async () => {
      classroomId = await createFixtureClassroom({
        name: 'LinuxAgentClassroom',
        groupId: 'linux-agent-group',
      });

      writeLinuxAgentPackage('fake-linux-agent-package');

      const registerResponse = await fetch(`${harness.apiUrl}/api/machines/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${harness.registrationToken}`,
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
      const response = await fetch(`${harness.apiUrl}/api/agent/linux/manifest`);
      assert.strictEqual(response.status, 401);
    });

    await test('should return linux package metadata and hash from the API manifest', async () => {
      const response = await fetch(`${harness.apiUrl}/api/agent/linux/manifest`, {
        headers: { Authorization: `Bearer ${machineToken}` },
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
      assert.strictEqual(data.version, tokenDeliveryArtifacts.linuxAgentVersion);
      assert.strictEqual(data.packageFileName, linuxAgentPackageFileName);
      assert.strictEqual(data.size, 'fake-linux-agent-package'.length);
      assert.strictEqual(data.sha256.length, 64);
      assert.ok(data.minSupportedVersion.length > 0);
      assert.ok(data.minDirectUpgradeVersion.length > 0);
      assert.ok(
        data.downloadPath.includes(`/api/agent/linux/packages/${encodeURIComponent(data.version)}`)
      );
    });

    await test('should include configured bridge versions in the linux API manifest', async () => {
      process.env.OPENPATH_LINUX_AGENT_BRIDGE_VERSIONS = '3.8.0, 3.9.0';

      try {
        const response = await fetch(`${harness.apiUrl}/api/agent/linux/manifest`, {
          headers: { Authorization: `Bearer ${machineToken}` },
        });

        assert.strictEqual(response.status, 200);
        const data = (await response.json()) as { bridgeVersions: string[] };
        assert.deepStrictEqual(data.bridgeVersions, ['3.8.0', '3.9.0']);
      } finally {
        delete process.env.OPENPATH_LINUX_AGENT_BRIDGE_VERSIONS;
      }
    });

    await test('should prefer OPENPATH_LINUX_AGENT_VERSION over the server version for linux manifests', async () => {
      const pinnedVersion = '9.9.9';
      const originalPinnedVersion = process.env.OPENPATH_LINUX_AGENT_VERSION;
      const { packageFileName, packageFilePath } = writeLinuxAgentPackage(
        'fake-linux-pinned-package',
        pinnedVersion
      );

      process.env.OPENPATH_LINUX_AGENT_VERSION = pinnedVersion;

      try {
        const response = await fetch(`${harness.apiUrl}/api/agent/linux/manifest`, {
          headers: { Authorization: `Bearer ${machineToken}` },
        });

        assert.strictEqual(response.status, 200);
        const data = (await response.json()) as {
          version: string;
          packageFileName: string;
          downloadPath: string;
        };

        assert.strictEqual(data.version, pinnedVersion);
        assert.strictEqual(data.packageFileName, packageFileName);
        assert.ok(
          data.downloadPath.includes(
            `/api/agent/linux/packages/${encodeURIComponent(pinnedVersion)}`
          )
        );
      } finally {
        rmSync(packageFilePath, { force: true });
        if (originalPinnedVersion === undefined) {
          delete process.env.OPENPATH_LINUX_AGENT_VERSION;
        } else {
          process.env.OPENPATH_LINUX_AGENT_VERSION = originalPinnedVersion;
        }
      }
    });

    await test('should download the linux agent package through the API path', async () => {
      const manifestResponse = await fetch(`${harness.apiUrl}/api/agent/linux/manifest`, {
        headers: { Authorization: `Bearer ${machineToken}` },
      });
      assert.strictEqual(manifestResponse.status, 200);

      const manifest = (await manifestResponse.json()) as { downloadPath: string };
      const response = await fetch(`${harness.apiUrl}${manifest.downloadPath}`, {
        headers: { Authorization: `Bearer ${machineToken}` },
      });

      assert.strictEqual(response.status, 200);
      assert.strictEqual(await response.text(), 'fake-linux-agent-package');
    });

    await test('should serve linux manifest and package from APT metadata when no local package is bundled', async () => {
      const pinnedVersion = '8.8.8';
      const packagePayload = 'fake-linux-agent-package-from-apt';
      const packageSize = packagePayload.length;
      const packagePath = `pool/main/o/openpath-dnsmasq/openpath-dnsmasq_${pinnedVersion}-1_amd64.deb`;
      const originalFetch = globalThis.fetch;
      const originalPinnedVersion = process.env.OPENPATH_LINUX_AGENT_VERSION;
      const originalAptSuite = process.env.OPENPATH_LINUX_AGENT_APT_SUITE;

      process.env.OPENPATH_LINUX_AGENT_VERSION = pinnedVersion;
      process.env.OPENPATH_LINUX_AGENT_APT_SUITE = 'stable';
      clearLinuxAgentAptMetadataCache();

      globalThis.fetch = (async (
        input: string | URL | Request,
        init?: RequestInit
      ): Promise<Response> => {
        const url = input instanceof Request ? input.url : String(input);

        if (url.endsWith('/dists/stable/main/binary-amd64/Packages')) {
          return new Response(
            `
Package: openpath-dnsmasq
Version: ${pinnedVersion}-1
Filename: ${packagePath}
Size: ${String(packageSize)}
SHA256: ${'a'.repeat(64)}
`,
            { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
          );
        }

        if (url.endsWith(`/${packagePath}`)) {
          return new Response(packagePayload, {
            status: 200,
            headers: { 'Content-Type': 'application/vnd.debian.binary-package' },
          });
        }

        return originalFetch(input, init);
      }) as typeof fetch;

      try {
        const manifestResponse = await fetch(`${harness.apiUrl}/api/agent/linux/manifest`, {
          headers: { Authorization: `Bearer ${machineToken}` },
        });

        assert.strictEqual(manifestResponse.status, 200);
        const manifest = (await manifestResponse.json()) as {
          downloadPath: string;
          packageFileName: string;
          sha256: string;
          size: number;
          version: string;
        };

        assert.strictEqual(manifest.version, pinnedVersion);
        assert.strictEqual(
          manifest.packageFileName,
          `openpath-dnsmasq_${pinnedVersion}-1_amd64.deb`
        );
        assert.strictEqual(manifest.sha256, 'a'.repeat(64));
        assert.strictEqual(manifest.size, packageSize);

        const packageResponse = await fetch(`${harness.apiUrl}${manifest.downloadPath}`, {
          headers: { Authorization: `Bearer ${machineToken}` },
        });

        assert.strictEqual(packageResponse.status, 200);
        assert.strictEqual(await packageResponse.text(), packagePayload);
      } finally {
        globalThis.fetch = originalFetch;
        clearLinuxAgentAptMetadataCache();
        if (originalPinnedVersion === undefined) {
          delete process.env.OPENPATH_LINUX_AGENT_VERSION;
        } else {
          process.env.OPENPATH_LINUX_AGENT_VERSION = originalPinnedVersion;
        }
        if (originalAptSuite === undefined) {
          delete process.env.OPENPATH_LINUX_AGENT_APT_SUITE;
        } else {
          process.env.OPENPATH_LINUX_AGENT_APT_SUITE = originalAptSuite;
        }
      }
    });

    await test('should find linux APT packages in the alternate suite when the configured suite is stale', async () => {
      const pinnedVersion = '0.0.20260418214748';
      const packagePayload = 'fake-linux-agent-package-from-unstable';
      const packageSize = packagePayload.length;
      const packagePath = `pool/main/o/openpath-dnsmasq/openpath-dnsmasq_${pinnedVersion}-1_all.deb`;
      const originalFetch = globalThis.fetch;
      const originalPinnedVersion = process.env.OPENPATH_LINUX_AGENT_VERSION;
      const originalAptSuite = process.env.OPENPATH_LINUX_AGENT_APT_SUITE;

      process.env.OPENPATH_LINUX_AGENT_VERSION = pinnedVersion;
      process.env.OPENPATH_LINUX_AGENT_APT_SUITE = 'stable';
      clearLinuxAgentAptMetadataCache();

      globalThis.fetch = (async (
        input: string | URL | Request,
        init?: RequestInit
      ): Promise<Response> => {
        const url = input instanceof Request ? input.url : String(input);

        if (url.endsWith('/dists/stable/main/binary-amd64/Packages')) {
          return new Response(
            `
Package: openpath-dnsmasq
Version: 4.1.25-1
Filename: pool/main/o/openpath-dnsmasq/openpath-dnsmasq_4.1.25-1_all.deb
Size: 588544
SHA256: ${'b'.repeat(64)}
`,
            { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
          );
        }

        if (url.endsWith('/dists/unstable/main/binary-amd64/Packages')) {
          return new Response(
            `
Package: openpath-dnsmasq
Version: ${pinnedVersion}-1
Filename: ${packagePath}
Size: ${String(packageSize)}
SHA256: ${'c'.repeat(64)}
`,
            { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
          );
        }

        if (url.endsWith(`/${packagePath}`)) {
          return new Response(packagePayload, {
            status: 200,
            headers: { 'Content-Type': 'application/vnd.debian.binary-package' },
          });
        }

        return originalFetch(input, init);
      }) as typeof fetch;

      try {
        const manifestResponse = await fetch(`${harness.apiUrl}/api/agent/linux/manifest`, {
          headers: { Authorization: `Bearer ${machineToken}` },
        });

        assert.strictEqual(manifestResponse.status, 200);
        const manifest = (await manifestResponse.json()) as {
          downloadPath: string;
          packageFileName: string;
          sha256: string;
          size: number;
          version: string;
        };

        assert.strictEqual(manifest.version, pinnedVersion);
        assert.strictEqual(manifest.packageFileName, `openpath-dnsmasq_${pinnedVersion}-1_all.deb`);
        assert.strictEqual(manifest.sha256, 'c'.repeat(64));
        assert.strictEqual(manifest.size, packageSize);

        const packageResponse = await fetch(`${harness.apiUrl}${manifest.downloadPath}`, {
          headers: { Authorization: `Bearer ${machineToken}` },
        });

        assert.strictEqual(packageResponse.status, 200);
        assert.strictEqual(await packageResponse.text(), packagePayload);
      } finally {
        globalThis.fetch = originalFetch;
        clearLinuxAgentAptMetadataCache();
        if (originalPinnedVersion === undefined) {
          delete process.env.OPENPATH_LINUX_AGENT_VERSION;
        } else {
          process.env.OPENPATH_LINUX_AGENT_VERSION = originalPinnedVersion;
        }
        if (originalAptSuite === undefined) {
          delete process.env.OPENPATH_LINUX_AGENT_APT_SUITE;
        } else {
          process.env.OPENPATH_LINUX_AGENT_APT_SUITE = originalAptSuite;
        }
      }
    });

    await test('should download a specific bridge package version when it is available', async () => {
      const bridgeVersion = '3.9.0';
      const { packageFilePath } = writeLinuxAgentPackage(
        'fake-linux-bridge-package',
        bridgeVersion
      );

      try {
        const response = await fetch(
          `${harness.apiUrl}/api/agent/linux/packages/${encodeURIComponent(bridgeVersion)}`,
          {
            headers: { Authorization: `Bearer ${machineToken}` },
          }
        );

        assert.strictEqual(response.status, 200);
        assert.strictEqual(await response.text(), 'fake-linux-bridge-package');
      } finally {
        rmSync(packageFilePath, { force: true });
      }
    });

    await test('should pin the configured linux package version in enrollment bootstrap scripts when APT still advertises it', async () => {
      const originalPinnedVersion = process.env.OPENPATH_LINUX_AGENT_VERSION;
      const restoreFetch = mockStableAptPackagesManifest(`
Package: openpath-dnsmasq
Version: 9.9.9-1
`);
      process.env.OPENPATH_LINUX_AGENT_VERSION = '9.9.9';

      try {
        const enrollmentToken = await harness.getEnrollmentToken(classroomId);
        const response = await fetch(`${harness.apiUrl}/api/enroll/${classroomId}`, {
          headers: { Authorization: `Bearer ${enrollmentToken}` },
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

    await test('should fail closed when configured linux package pin is absent from the selected APT suite', async () => {
      const originalPinnedVersion = process.env.OPENPATH_LINUX_AGENT_VERSION;
      const originalAptSuite = process.env.OPENPATH_LINUX_AGENT_APT_SUITE;
      const restoreFetch = mockStableAptPackagesManifest(`
Package: openpath-dnsmasq
Version: 4.1.10-1
`);
      process.env.OPENPATH_LINUX_AGENT_VERSION = '4.1.9';
      process.env.OPENPATH_LINUX_AGENT_APT_SUITE = 'stable';

      try {
        const enrollmentToken = await harness.getEnrollmentToken(classroomId);
        const response = await fetch(`${harness.apiUrl}/api/enroll/${classroomId}`, {
          headers: { Authorization: `Bearer ${enrollmentToken}` },
        });

        assert.strictEqual(response.status, 500);
        const body = await response.text();
        assert.match(body, /not advertised by APT suite stable/);
      } finally {
        restoreFetch();
        if (originalPinnedVersion === undefined) {
          delete process.env.OPENPATH_LINUX_AGENT_VERSION;
        } else {
          process.env.OPENPATH_LINUX_AGENT_VERSION = originalPinnedVersion;
        }
        if (originalAptSuite === undefined) {
          delete process.env.OPENPATH_LINUX_AGENT_APT_SUITE;
        } else {
          process.env.OPENPATH_LINUX_AGENT_APT_SUITE = originalAptSuite;
        }
      }
    });

    await test('should pass the configured unstable APT suite and pinned linux package version to enrollment bootstrap scripts', async () => {
      const originalPinnedVersion = process.env.OPENPATH_LINUX_AGENT_VERSION;
      const originalAptSuite = process.env.OPENPATH_LINUX_AGENT_APT_SUITE;
      const restoreFetch = mockAptPackagesManifest(
        `
Package: openpath-dnsmasq
Version: 0.0.1380-1
`,
        'unstable'
      );
      process.env.OPENPATH_LINUX_AGENT_VERSION = '0.0.1380';
      process.env.OPENPATH_LINUX_AGENT_APT_SUITE = 'unstable';

      try {
        const enrollmentToken = await harness.getEnrollmentToken(classroomId);
        const response = await fetch(`${harness.apiUrl}/api/enroll/${classroomId}`, {
          headers: { Authorization: `Bearer ${enrollmentToken}` },
        });

        assert.strictEqual(response.status, 200);
        const body = await response.text();
        assert.match(body, /LINUX_AGENT_VERSION='0\.0\.1380'/);
        assert.match(body, /LINUX_AGENT_APT_SUITE='unstable'/);
        assert.match(body, /--unstable/);
        assert.match(body, /--package-version "\$LINUX_AGENT_VERSION"/);
      } finally {
        restoreFetch();
        if (originalPinnedVersion === undefined) {
          delete process.env.OPENPATH_LINUX_AGENT_VERSION;
        } else {
          process.env.OPENPATH_LINUX_AGENT_VERSION = originalPinnedVersion;
        }
        if (originalAptSuite === undefined) {
          delete process.env.OPENPATH_LINUX_AGENT_APT_SUITE;
        } else {
          process.env.OPENPATH_LINUX_AGENT_APT_SUITE = originalAptSuite;
        }
      }
    });
  });
});
