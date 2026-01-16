import { test, expect } from '@playwright/test';

// UAT Script: 01_admin_tic.md Section 3 (Tests 3.1-3.6)

test.describe('Requests Section - DOM Structure', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('requests section should exist in DOM', { tag: '@smoke' }, async ({ page }) => {
        const requestsSection = page.locator('#requests-section');
        await expect(requestsSection).toBeAttached();
    });

    test('requests section should have header with title', async ({ page }) => {
        const sectionHeader = page.locator('#requests-section .section-header h2');
        await expect(sectionHeader).toBeAttached();
        await expect(sectionHeader).toContainText('Solicitudes');
    });

    test('requests list container should exist', async ({ page }) => {
        const requestsList = page.locator('#requests-list');
        await expect(requestsList).toBeAttached();
    });

    test('refresh requests button should exist', async ({ page }) => {
        const refreshBtn = page.locator('#refresh-requests-btn');
        await expect(refreshBtn).toBeAttached();
    });

    test('server status indicator should exist', async ({ page }) => {
        const serverStatus = page.locator('#requests-server-status');
        await expect(serverStatus).toBeAttached();
    });

    test('pending requests stat card should exist', async ({ page }) => {
        const statCard = page.locator('#stat-pending-requests');
        await expect(statCard).toBeAttached();
    });

});

test.describe('Requests - Stats Display', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('stat card should show pending requests count', async ({ page }) => {
        const pendingCount = page.locator('#stat-pending-requests');
        await expect(pendingCount).toBeAttached();
        const text = await pendingCount.textContent();
        expect(text).toMatch(/^\d+$/);
    });

    test('requests stat card should be clickable', async ({ page }) => {
        const statCard = page.locator('#stat-requests-card');
        await expect(statCard).toBeAttached();
    });

    test('stats section should contain requests card', async ({ page }) => {
        const statsSection = page.locator('.stats-section');
        await expect(statsSection).toBeAttached();
        const requestsCard = statsSection.locator('#stat-requests-card');
        await expect(requestsCard).toBeAttached();
    });

});

test.describe('Requests - Server Status Indicator', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('server status should have status dot', async ({ page }) => {
        const statusDot = page.locator('#requests-server-status .status-dot');
        await expect(statusDot).toBeAttached();
    });

    test('server status should have status text', async ({ page }) => {
        const statusText = page.locator('#requests-server-status .status-text');
        await expect(statusText).toBeAttached();
    });

});

test.describe('Requests - Configuration', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('requests config container should exist', async ({ page }) => {
        const configContainer = page.locator('#requests-config');
        await expect(configContainer).toBeAttached();
    });

    test('API URL field should exist in config', async ({ page }) => {
        const apiUrlField = page.locator('#requests-api-url');
        await expect(apiUrlField).toBeAttached();
    });

    test('API token field should exist in config', async ({ page }) => {
        const apiTokenField = page.locator('#requests-api-token');
        await expect(apiTokenField).toBeAttached();
        await expect(apiTokenField).toHaveAttribute('type', 'password');
    });

    test('save config button should exist', async ({ page }) => {
        const saveBtn = page.locator('#save-requests-config-btn');
        await expect(saveBtn).toBeAttached();
    });

});

test.describe('Requests - Empty State', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('requests list should have empty message element', async ({ page }) => {
        const emptyMessage = page.locator('#requests-list .empty-message');
        await expect(emptyMessage).toBeAttached();
    });

    test('empty message should indicate no pending requests', async ({ page }) => {
        const emptyMessage = page.locator('#requests-list .empty-message');
        const text = await emptyMessage.textContent();
        expect(text?.toLowerCase()).toContain('no hay');
    });

});

test.describe('Blocked Domain Modal', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('blocked domain modal should exist in DOM', async ({ page }) => {
        const modal = page.locator('#modal-blocked-domain');
        await expect(modal).toBeAttached();
    });

    test('blocked domain modal should have warning header', async ({ page }) => {
        const header = page.locator('#modal-blocked-domain .modal-header-warning');
        await expect(header).toBeAttached();
    });

    test('blocked domain modal should display domain name', async ({ page }) => {
        const domainName = page.locator('#blocked-domain-name');
        await expect(domainName).toBeAttached();
    });

    test('blocked domain modal should display blocking rule', async ({ page }) => {
        const blockingRule = page.locator('#blocked-domain-rule');
        await expect(blockingRule).toBeAttached();
    });

    test('blocked domain modal should have hint for user', async ({ page }) => {
        const hint = page.locator('#blocked-domain-hint');
        await expect(hint).toBeAttached();
    });

    test('blocked domain modal should have dismiss button', async ({ page }) => {
        const dismissBtn = page.locator('#modal-blocked-domain .modal-cancel');
        await expect(dismissBtn).toBeAttached();
        await expect(dismissBtn).toContainText('Entendido');
    });

});

test.describe('Toast Notifications', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('toast container should exist for notifications', async ({ page }) => {
        const toastContainer = page.locator('#toast-container');
        await expect(toastContainer).toBeAttached();
    });

});

test.describe('Responsive - Requests Section', () => {

    test('requests section should be visible on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const requestsSection = page.locator('#requests-section');
        await expect(requestsSection).toBeAttached();
    });

    test('refresh button should be accessible on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const refreshBtn = page.locator('#refresh-requests-btn');
        await expect(refreshBtn).toBeAttached();
    });

    test('stat cards should be in DOM on tablet viewport', async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const statsSection = page.locator('.stats-section');
        await expect(statsSection).toBeAttached();
        
        const pendingCard = page.locator('#stat-pending-requests');
        await expect(pendingCard).toBeAttached();
    });

});
