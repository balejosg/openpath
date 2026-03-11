import { after, before, describe, test } from 'node:test';
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import { sql } from 'drizzle-orm';

const { ensureTestSchema, getAvailablePort } = await import('../test-utils.js');
const { loadConfig } = await import('../../src/config.js');
const { closeConnection, db } = await import('../../src/db/index.js');

let port: number;
let apiUrl: string;
let server: Server | undefined;

function hashMachineToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

await describe('public-requests routes', async () => {
  before(async () => {
    port = await getAvailablePort();
    apiUrl = `http://localhost:${String(port)}`;

    await ensureTestSchema();

    const express = (await import('express')).default;
    const { registerPublicRequestRoutes } = await import('../../src/routes/public-requests.js');
    const app = express();
    app.use(express.json());
    registerPublicRequestRoutes(app);
    await new Promise<void>((resolve) => {
      server = app.listen(port, () => {
        resolve();
      });
    });
  });

  after(async () => {
    if (server !== undefined) {
      if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => {
        server?.close(() => {
          resolve();
        });
      });
    }

    await closeConnection();
  });

  await test('loadConfig disables machine auto-approval by default and only enables it explicitly', () => {
    const baseEnv = {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret',
    };
    const defaultConfig = loadConfig(baseEnv);
    const enabledConfig = loadConfig({
      ...baseEnv,
      AUTO_APPROVE_MACHINE_REQUESTS: 'true',
    });
    const disabledConfig = loadConfig({
      ...baseEnv,
      AUTO_APPROVE_MACHINE_REQUESTS: 'false',
    });

    assert.strictEqual(defaultConfig.autoApproveMachineRequests, false);
    assert.strictEqual(enabledConfig.autoApproveMachineRequests, true);
    assert.strictEqual(disabledConfig.autoApproveMachineRequests, false);
  });

  await test('POST /api/requests/auto creates a pending request by default instead of a whitelist rule', async () => {
    const suffix = Date.now().toString();
    const groupId = `grp-${suffix}`;
    const classroomId = `cls-${suffix}`;
    const machineId = `mach-${suffix}`;
    const hostname = `host-${suffix}`;
    const token = `machine-token-${suffix}`;
    const domain = `auto-${suffix}.example.com`;

    await db.execute(
      sql.raw(
        `INSERT INTO whitelist_groups (id, name, display_name, enabled) VALUES ('${groupId}', '${groupId}', '${groupId}', 1)`
      )
    );
    await db.execute(
      sql.raw(
        `INSERT INTO classrooms (id, name, display_name, default_group_id, active_group_id) VALUES ('${classroomId}', '${classroomId}', '${classroomId}', '${groupId}', '${groupId}')`
      )
    );
    await db.execute(
      sql.raw(
        `INSERT INTO machines (id, hostname, classroom_id, version, download_token_hash) VALUES ('${machineId}', '${hostname}', '${classroomId}', 'test', '${hashMachineToken(token)}')`
      )
    );

    const response = await fetch(`${apiUrl}/api/requests/auto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Connection: 'close',
      },
      body: JSON.stringify({
        domain,
        hostname,
        token,
        origin_page: `${classroomId}.school.local/dashboard`,
        reason: 'Auto request should queue when auto-approve is disabled',
      }),
    });

    assert.strictEqual(response.status, 200);
    const payload = (await response.json()) as {
      success: boolean;
      id?: string;
      approved?: boolean;
      autoApproved?: boolean;
      status?: string;
      groupId?: string;
      source?: string;
    };

    assert.strictEqual(payload.success, true);
    assert.strictEqual(payload.approved, false);
    assert.strictEqual(payload.autoApproved, false);
    assert.strictEqual(payload.status, 'pending');
    assert.strictEqual(payload.groupId, groupId);
    assert.strictEqual(payload.source, 'auto_extension');
    assert.ok(typeof payload.id === 'string' && payload.id.length > 0);

    const requestRows = await db.execute(
      sql.raw(
        `SELECT status, group_id, source, machine_hostname, origin_page FROM requests WHERE domain='${domain}' LIMIT 1`
      )
    );
    const createdRequests = requestRows.rows as {
      status: string;
      group_id: string;
      source: string;
      machine_hostname: string;
      origin_page: string;
    }[];
    assert.strictEqual(createdRequests.length, 1);
    const firstRequest = createdRequests[0];
    assert.ok(firstRequest !== undefined);
    assert.strictEqual(firstRequest.status, 'pending');
    assert.strictEqual(firstRequest.group_id, groupId);
    assert.strictEqual(firstRequest.source, 'auto_extension');
    assert.strictEqual(firstRequest.machine_hostname, hostname);
    assert.ok(firstRequest.origin_page.includes(`${classroomId}.school.local`));

    const ruleRows = await db.execute(
      sql.raw(`SELECT id FROM whitelist_rules WHERE group_id='${groupId}' AND value='${domain}'`)
    );
    assert.strictEqual(ruleRows.rows.length, 0);
  });

  await test('POST /api/requests/submit rejects requests with missing required fields', async () => {
    const response = await fetch(`${apiUrl}/api/requests/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Connection: 'close',
      },
      body: JSON.stringify({
        hostname: 'missing-domain-host',
      }),
    });

    assert.strictEqual(response.status, 400);
    const payload = (await response.json()) as {
      success: boolean;
      error?: string;
    };

    assert.strictEqual(payload.success, false);
    assert.strictEqual(payload.error, 'domain, hostname and token are required');
  });

  await test('POST /api/requests/submit rejects invalid domains after machine proof succeeds', async () => {
    const suffix = `${Date.now().toString()}-submit-invalid-domain`;
    const groupId = `grp-${suffix}`;
    const classroomId = `cls-${suffix}`;
    const machineId = `mach-${suffix}`;
    const hostname = `host-${suffix}`;
    const token = `machine-token-${suffix}`;

    await db.execute(
      sql.raw(
        `INSERT INTO whitelist_groups (id, name, display_name, enabled) VALUES ('${groupId}', '${groupId}', '${groupId}', 1)`
      )
    );
    await db.execute(
      sql.raw(
        `INSERT INTO classrooms (id, name, display_name, default_group_id, active_group_id) VALUES ('${classroomId}', '${classroomId}', '${classroomId}', '${groupId}', '${groupId}')`
      )
    );
    await db.execute(
      sql.raw(
        `INSERT INTO machines (id, hostname, classroom_id, version, download_token_hash) VALUES ('${machineId}', '${hostname}', '${classroomId}', 'test', '${hashMachineToken(token)}')`
      )
    );

    const response = await fetch(`${apiUrl}/api/requests/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Connection: 'close',
      },
      body: JSON.stringify({
        domain: 'http://not-a-valid-domain',
        hostname,
        token,
      }),
    });

    assert.strictEqual(response.status, 400);
    const payload = (await response.json()) as {
      success: boolean;
      error?: string;
    };

    assert.strictEqual(payload.success, false);
    assert.match(payload.error ?? '', /domain/i);
  });
});
