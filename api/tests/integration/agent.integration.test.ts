/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Agent & Health Integration Tests
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import {
  bootstrapAdminSession,
  getAvailablePort,
  trpcQuery,
  trpcMutate,
  parseTRPC,
  bearerAuth,
  assertStatus,
  resetDb,
} from '../test-utils.js';
import { closeConnection } from '../../src/db/index.js';

let PORT: number;
let API_URL: string;
let ADMIN_TOKEN = '';

let server: Server | undefined;

async function createMachineToken(
  hostname: string
): Promise<{ machineHostname: string; machineToken: string }> {
  const suffix = `${hostname}-${String(Date.now())}`;

  const groupResponse = await trpcMutate(
    API_URL,
    'groups.create',
    { name: `group-${suffix}`, displayName: `group-${suffix}` },
    bearerAuth(ADMIN_TOKEN)
  );
  assertStatus(groupResponse, 200);
  const groupId = ((await parseTRPC(groupResponse)).data as { id: string }).id;

  const classroomResponse = await trpcMutate(
    API_URL,
    'classrooms.create',
    { name: `room-${suffix}`, displayName: `room-${suffix}`, defaultGroupId: groupId },
    bearerAuth(ADMIN_TOKEN)
  );
  assertStatus(classroomResponse, 200);
  const classroomId = ((await parseTRPC(classroomResponse)).data as { id: string }).id;

  const ticketResponse = await fetch(`${API_URL}/api/enroll/${classroomId}/ticket`, {
    method: 'POST',
    headers: bearerAuth(ADMIN_TOKEN),
  });
  assert.strictEqual(ticketResponse.status, 200);
  const ticketData = (await ticketResponse.json()) as { enrollmentToken?: string };
  assert.ok(ticketData.enrollmentToken);

  const registerResponse = await fetch(`${API_URL}/api/machines/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ticketData.enrollmentToken}`,
    },
    body: JSON.stringify({
      hostname,
      classroomId,
    }),
  });
  assert.strictEqual(registerResponse.status, 200);
  const registerData = (await registerResponse.json()) as {
    machineHostname: string;
    whitelistUrl: string;
  };

  const match = /\/w\/([^/]+)\//.exec(registerData.whitelistUrl);
  assert.ok(match);
  const machineToken = match[1];
  assert.ok(machineToken);

  return {
    machineHostname: registerData.machineHostname,
    machineToken,
  };
}

void describe('Agent & Health Integration', () => {
  before(async () => {
    await resetDb();

    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);
    process.env.JWT_SECRET = 'test-jwt-secret';

    const { app } = await import('../../src/server.js');

    server = app.listen(PORT);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    ADMIN_TOKEN = (await bootstrapAdminSession(API_URL, { name: 'Agent Integration Admin' }))
      .accessToken;
  });

  after(async () => {
    if (server !== undefined) {
      server.close();
    }
    await closeConnection();
  });

  void test('should receive health reports from agents', async () => {
    const hostname = 'agent-01';
    const machine = await createMachineToken(hostname);

    // 1. Submit report (Agent context)
    const reportResp = await trpcMutate(
      API_URL,
      'healthReports.submit',
      {
        hostname,
        status: 'HEALTHY',
        dnsmasqRunning: true,
        dnsResolving: true,
        version: '1.0.0',
      },
      bearerAuth(machine.machineToken)
    );

    assertStatus(reportResp, 200);

    // 2. Verify in list (Admin context)
    const listResp = await trpcQuery(
      API_URL,
      'healthReports.list',
      undefined,
      bearerAuth(ADMIN_TOKEN)
    );
    assertStatus(listResp, 200);
    const { data: summary } = (await parseTRPC(listResp)) as {
      data: { hosts: { hostname: string; status: string }[] };
    };

    const agent = summary.hosts.find((h) => h.hostname === machine.machineHostname);
    assert.ok(agent);
    assert.strictEqual(agent.status, 'HEALTHY');
  });

  void test('should detect stale agents', async () => {
    const staleHostname = 'stale-agent';
    const machine = await createMachineToken(staleHostname);

    await trpcMutate(
      API_URL,
      'healthReports.submit',
      {
        hostname: staleHostname,
        status: 'HEALTHY',
      },
      bearerAuth(machine.machineToken)
    );

    const alertsResp = await trpcQuery(
      API_URL,
      'healthReports.getAlerts',
      { staleThreshold: 60 },
      bearerAuth(ADMIN_TOKEN)
    );
    const { data: alerts } = (await parseTRPC(alertsResp)) as {
      data: { alerts: { hostname: string; type: string }[] };
    };

    const staleAlert = alerts.alerts.find(
      (a) => a.hostname === machine.machineHostname && a.type === 'stale'
    );
    assert.ok(!staleAlert, 'Agent should not be stale yet');
  });

  void test('should normalize legacy health statuses to canonical values', async () => {
    const legacyHostname = 'legacy-status-agent';
    const machine = await createMachineToken(legacyHostname);

    await trpcMutate(
      API_URL,
      'healthReports.submit',
      {
        hostname: legacyHostname,
        status: 'OK',
        actions: 'legacy_probe',
      },
      bearerAuth(machine.machineToken)
    );

    const listResp = await trpcQuery(
      API_URL,
      'healthReports.list',
      undefined,
      bearerAuth(ADMIN_TOKEN)
    );
    assertStatus(listResp, 200);

    const { data: summary } = (await parseTRPC(listResp)) as {
      data: { hosts: { hostname: string; status: string }[] };
    };

    const host = summary.hosts.find((h) => h.hostname === machine.machineHostname);
    assert.ok(host, 'Legacy host should exist in health list');
    assert.strictEqual(host.status, 'HEALTHY');
  });

  void test('should include tampered agents in status alerts', async () => {
    const tamperedHostname = 'tampered-agent';
    const machine = await createMachineToken(tamperedHostname);

    await trpcMutate(
      API_URL,
      'healthReports.submit',
      {
        hostname: tamperedHostname,
        status: 'TAMPERED',
      },
      bearerAuth(machine.machineToken)
    );

    const alertsResp = await trpcQuery(
      API_URL,
      'healthReports.getAlerts',
      { staleThreshold: 60 },
      bearerAuth(ADMIN_TOKEN)
    );

    assertStatus(alertsResp, 200);
    const { data: alerts } = (await parseTRPC(alertsResp)) as {
      data: { alerts: { hostname: string; type: string; status: string }[] };
    };

    const tamperedAlert = alerts.alerts.find(
      (a) =>
        a.hostname === machine.machineHostname && a.type === 'status' && a.status === 'TAMPERED'
    );
    assert.ok(tamperedAlert, 'Tampered agent should appear in status alerts');
  });

  void test('should map legacy WARNING status to DEGRADED alerts', async () => {
    const warningHostname = 'legacy-warning-agent';
    const machine = await createMachineToken(warningHostname);

    await trpcMutate(
      API_URL,
      'healthReports.submit',
      {
        hostname: warningHostname,
        status: 'WARNING',
      },
      bearerAuth(machine.machineToken)
    );

    const alertsResp = await trpcQuery(
      API_URL,
      'healthReports.getAlerts',
      { staleThreshold: 60 },
      bearerAuth(ADMIN_TOKEN)
    );

    assertStatus(alertsResp, 200);
    const { data: alerts } = (await parseTRPC(alertsResp)) as {
      data: { alerts: { hostname: string; type: string; status: string }[] };
    };

    const degradedAlert = alerts.alerts.find(
      (a) =>
        a.hostname === machine.machineHostname && a.type === 'status' && a.status === 'DEGRADED'
    );
    assert.ok(degradedAlert, 'Legacy WARNING status should surface as DEGRADED');
  });
});
