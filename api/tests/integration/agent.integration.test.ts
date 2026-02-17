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
const ADMIN_TOKEN = 'test-admin-token';
const SHARED_SECRET = 'test-shared-secret';

let server: Server | undefined;

void describe('Agent & Health Integration', () => {
  before(async () => {
    await resetDb();

    PORT = await getAvailablePort();
    API_URL = `http://localhost:${String(PORT)}`;
    process.env.PORT = String(PORT);
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    process.env.SHARED_SECRET = SHARED_SECRET;

    const { app } = await import('../../src/server.js');

    server = app.listen(PORT);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  after(async () => {
    if (server !== undefined) {
      server.close();
    }
    await closeConnection();
  });

  void test('should receive health reports from agents', async () => {
    const hostname = 'agent-01';

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
      bearerAuth(SHARED_SECRET)
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

    const agent = summary.hosts.find((h) => h.hostname === hostname);
    assert.ok(agent);
    assert.strictEqual(agent.status, 'HEALTHY');
  });

  void test('should detect stale agents', async () => {
    const staleHostname = 'stale-agent';

    await trpcMutate(
      API_URL,
      'healthReports.submit',
      {
        hostname: staleHostname,
        status: 'HEALTHY',
      },
      bearerAuth(SHARED_SECRET)
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
      (a) => a.hostname === staleHostname && a.type === 'stale'
    );
    assert.ok(!staleAlert, 'Agent should not be stale yet');
  });

  void test('should normalize legacy health statuses to canonical values', async () => {
    const legacyHostname = 'legacy-status-agent';

    await trpcMutate(
      API_URL,
      'healthReports.submit',
      {
        hostname: legacyHostname,
        status: 'OK',
        actions: 'legacy_probe',
      },
      bearerAuth(SHARED_SECRET)
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

    const host = summary.hosts.find((h) => h.hostname === legacyHostname);
    assert.ok(host, 'Legacy host should exist in health list');
    assert.strictEqual(host.status, 'HEALTHY');
  });

  void test('should include tampered agents in status alerts', async () => {
    const tamperedHostname = 'tampered-agent';

    await trpcMutate(
      API_URL,
      'healthReports.submit',
      {
        hostname: tamperedHostname,
        status: 'TAMPERED',
      },
      bearerAuth(SHARED_SECRET)
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
      (a) => a.hostname === tamperedHostname && a.type === 'status' && a.status === 'TAMPERED'
    );
    assert.ok(tamperedAlert, 'Tampered agent should appear in status alerts');
  });

  void test('should map legacy WARNING status to DEGRADED alerts', async () => {
    const warningHostname = 'legacy-warning-agent';

    await trpcMutate(
      API_URL,
      'healthReports.submit',
      {
        hostname: warningHostname,
        status: 'WARNING',
      },
      bearerAuth(SHARED_SECRET)
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
      (a) => a.hostname === warningHostname && a.type === 'status' && a.status === 'DEGRADED'
    );
    assert.ok(degradedAlert, 'Legacy WARNING status should surface as DEGRADED');
  });
});
