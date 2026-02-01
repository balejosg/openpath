/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Groups & Domains Integration Tests
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
    uniqueDomain,
    resetDb,
} from '../test-utils.js';
import { closeConnection } from '../../src/db/index.js';

let PORT: number;
let API_URL: string;
const ADMIN_TOKEN = 'test-admin-token';

let server: Server | undefined;

void describe('Groups & Domains Integration', () => {
    before(async () => {
        await resetDb();
        
        PORT = await getAvailablePort();
        API_URL = `http://localhost:${String(PORT)}`;
        process.env.PORT = String(PORT);
        process.env.ADMIN_TOKEN = ADMIN_TOKEN;
        
        const { app } = await import('../../src/server.js');

        server = app.listen(PORT, () => {
            console.log(`Groups integration server started on port ${String(PORT)}`);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
    });

    after(async () => {
        if (server !== undefined) {
            server.close();
        }
        await closeConnection();
    });

    void describe('Whitelist Rule Management', () => {
        let groupId: string;
        const groupName = 'integration-group';

        void test('should create a group and add domain rules', async () => {
            // 1. Create Group
            const createResp = await trpcMutate(API_URL, 'groups.create', {
                name: groupName,
                displayName: 'Integration Group',
            }, bearerAuth(ADMIN_TOKEN));
            
            assertStatus(createResp, 200);
            const { data: group } = await parseTRPC(createResp) as { data: { id: string } };
            groupId = group.id;

            // 2. Add multiple domains (Bulk)
            const domains = [
                uniqueDomain('domain1'),
                uniqueDomain('domain2'),
                'google.com'
            ];

            const bulkResp = await trpcMutate(API_URL, 'groups.bulkCreateRules', {
                groupId,
                type: 'whitelist',
                values: domains,
            }, bearerAuth(ADMIN_TOKEN));

            assertStatus(bulkResp, 200);
            const { data: bulkResult } = await parseTRPC(bulkResp) as { data: { count: number } };
            assert.strictEqual(bulkResult.count, 3);

            // 3. Verify rules are listed
            const listResp = await trpcQuery(API_URL, 'groups.listRules', { groupId }, bearerAuth(ADMIN_TOKEN));
            assertStatus(listResp, 200);
            const { data: rules } = await parseTRPC(listResp) as { data: { value: string }[] };
            
            assert.strictEqual(rules.length, 3);
            assert.ok(rules.some(r => r.value === 'google.com'));
        });

        void test('should handle blocked subdomains and paths', async () => {
            // Add blocked subdomain
            await trpcMutate(API_URL, 'groups.createRule', {
                groupId,
                type: 'blocked_subdomain',
                value: 'ads.google.com',
            }, bearerAuth(ADMIN_TOKEN));

            // Add blocked path
            await trpcMutate(API_URL, 'groups.createRule', {
                groupId,
                type: 'blocked_path',
                value: '/api/v1/track',
            }, bearerAuth(ADMIN_TOKEN));

            const statsResp = await trpcQuery(API_URL, 'groups.stats', undefined, bearerAuth(ADMIN_TOKEN));
            const { data: stats } = await parseTRPC(statsResp) as { data: { whitelistCount: number; blockedCount: number } };
            
            assert.ok(stats.whitelistCount >= 3);
            assert.ok(stats.blockedCount >= 2);
        });

        void test('should export group correctly', async () => {
            const exportResp = await trpcQuery(API_URL, 'groups.export', { groupId }, bearerAuth(ADMIN_TOKEN));
            assertStatus(exportResp, 200);
            const { data: exported } = await parseTRPC(exportResp) as { data: { content: string } };
            
            assert.ok(exported.content.includes('## WHITELIST'));
            assert.ok(exported.content.includes('## BLOCKED-SUBDOMAINS'));
            assert.ok(exported.content.includes('## BLOCKED-PATHS'));
            assert.ok(exported.content.includes('google.com'));
            assert.ok(exported.content.includes('ads.google.com'));
        });
    });
});
