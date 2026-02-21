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
import { getAvailablePort, resetDb, trpcMutate as _trpcMutate, parseTRPC } from './test-utils.js';
import { closeConnection, db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

let PORT: number;
let API_URL: string;
let server: Server | undefined;
let registrationToken: string;
let adminEmail: string;
let adminPassword: string;

const GLOBAL_TIMEOUT = setTimeout(() => {
  console.error('\n❌ Token delivery tests timed out! Forcing exit...');
  process.exit(1);
}, 30000);
GLOBAL_TIMEOUT.unref();

const trpcMutate = (procedure: string, input: unknown): Promise<Response> =>
  _trpcMutate(API_URL, procedure, input);

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
  await db.execute(
    sql.raw(`
        INSERT INTO classrooms (id, name, display_name, default_group_id, active_group_id)
        VALUES ('${id}', '${name}', '${name}', '${groupId}', '${groupId}')
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
      machineHostname = 'rotate-test-pc';
    });

    await test('should rotate token and return new URL', async () => {
      const response = await fetch(
        `${API_URL}/api/machines/${machineHostname}/rotate-download-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-shared-secret',
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

    await test('should reject invalid shared secret', async () => {
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

    await test('should reject non-existent machine', async () => {
      const response = await fetch(
        `${API_URL}/api/machines/non-existent-pc/rotate-download-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-shared-secret',
          },
        }
      );

      assert.strictEqual(response.status, 404);
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
