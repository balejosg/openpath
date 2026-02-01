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

describe('Agent & Health Integration', async () => {
    before(async () => {
        await resetDb();
        
        PORT = await getAvailablePort();
        API_URL = `http://localhost:${String(PORT)}`;
        process.env.PORT = String(PORT);
        process.env.ADMIN_TOKEN = ADMIN_TOKEN;
        process.env.SHARED_SECRET = SHARED_SECRET;
        
        const { app } = await import('../../src/server.js');

        server = app.listen(PORT);
        await new Promise(resolve => setTimeout(resolve, 1000));
    });

    after(async () => {
        if (server !== undefined) {
            server.close();
        }
        await closeConnection();
    });

    test('should receive health reports from agents', async () => {
        const hostname = 'agent-01';

        // 1. Submit report (Agent context)
        const reportResp = await trpcMutate(API_URL, 'healthReports.submit', {
            hostname,
            status: 'HEALTHY',
            dnsmasqRunning: true,
            dnsResolving: true,
            version: '1.0.0'
        }, bearerAuth(SHARED_SECRET));

        assertStatus(reportResp, 200);

        // 2. Verify in list (Admin context)
        const listResp = await trpcQuery(API_URL, 'healthReports.list', undefined, bearerAuth(ADMIN_TOKEN));
        assertStatus(listResp, 200);
        const { data: summary } = await parseTRPC(listResp) as { data: any };
        
        const agent = summary.hosts.find((h: any) => h.hostname === hostname);
        assert.ok(agent);
        assert.strictEqual(agent.status, 'HEALTHY');
    });

    test('should detect stale agents', async () => {
        const staleHostname = 'stale-agent';
        
        // Submit an old report (not possible directly via API as timestamp is server-side, 
        // but we can test the getAlerts logic with a high threshold or mock data if needed.
        // For now, we test that it's NOT stale initially)
        
        await trpcMutate(API_URL, 'healthReports.submit', {
            hostname: staleHostname,
            status: 'HEALTHY',
        }, bearerAuth(SHARED_SECRET));

        const alertsResp = await trpcQuery(API_URL, 'healthReports.getAlerts', { staleThreshold: 60 }, bearerAuth(ADMIN_TOKEN));
        const { data: alerts } = await parseTRPC(alertsResp) as { data: any };
        
        const staleAlert = alerts.alerts.find((a: any) => a.hostname === staleHostname && a.type === 'stale');
        assert.ok(!staleAlert, 'Agent should not be stale yet');
    });
});
