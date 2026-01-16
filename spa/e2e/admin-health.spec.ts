import { test, expect } from '@playwright/test';

// UAT Script: 01_admin_tic.md Section 6 (Tests 6.1-6.4)

test.describe('Stats Section - System Health Overview', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('stats section should exist in DOM', { tag: '@smoke' }, async ({ page }) => {
        const statsSection = page.locator('.stats-section');
        await expect(statsSection).toBeAttached();
    });

    test('groups stat card should exist', async ({ page }) => {
        const groupsStat = page.locator('#stat-groups');
        await expect(groupsStat).toBeAttached();
    });

    test('whitelist stat card should exist', async ({ page }) => {
        const whitelistStat = page.locator('#stat-whitelist');
        await expect(whitelistStat).toBeAttached();
    });

    test('blocked stat card should exist', async ({ page }) => {
        const blockedStat = page.locator('#stat-blocked');
        await expect(blockedStat).toBeAttached();
    });

    test('pending requests stat card should exist', async ({ page }) => {
        const pendingStat = page.locator('#stat-pending-requests');
        await expect(pendingStat).toBeAttached();
    });

});

test.describe('Stats - Values Display', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('groups stat should show numeric value', async ({ page }) => {
        const groupsStat = page.locator('#stat-groups');
        const text = await groupsStat.textContent();
        expect(text).toMatch(/^\d+$/);
    });

    test('whitelist stat should show numeric value', async ({ page }) => {
        const whitelistStat = page.locator('#stat-whitelist');
        const text = await whitelistStat.textContent();
        expect(text).toMatch(/^\d+$/);
    });

    test('blocked stat should show numeric value', async ({ page }) => {
        const blockedStat = page.locator('#stat-blocked');
        const text = await blockedStat.textContent();
        expect(text).toMatch(/^\d+$/);
    });

    test('pending requests stat should show numeric value', async ({ page }) => {
        const pendingStat = page.locator('#stat-pending-requests');
        const text = await pendingStat.textContent();
        expect(text).toMatch(/^\d+$/);
    });

});

test.describe('Stat Cards - Structure', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('stat cards should have icons', async ({ page }) => {
        const statIcons = page.locator('.stat-card .stat-icon');
        await expect(statIcons.first()).toBeAttached();
    });

    test('stat cards should have labels', async ({ page }) => {
        const statLabels = page.locator('.stat-card .stat-label');
        await expect(statLabels.first()).toBeAttached();
    });

    test('stat cards should have number elements', async ({ page }) => {
        const statNumbers = page.locator('.stat-card .stat-number');
        await expect(statNumbers.first()).toBeAttached();
    });

});

test.describe('System Status Banner', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('system status banner should exist in DOM', async ({ page }) => {
        const statusBanner = page.locator('#system-status-banner');
        await expect(statusBanner).toBeAttached();
    });

    test('system status banner should have status content', async ({ page }) => {
        const statusContent = page.locator('#system-status-banner .status-content');
        await expect(statusContent).toBeAttached();
    });

    test('system status banner should have reactivate button', async ({ page }) => {
        const reactivateBtn = page.locator('#reactivate-btn');
        await expect(reactivateBtn).toBeAttached();
    });

});

test.describe('System Toggle', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('system toggle button should exist in header', async ({ page }) => {
        const toggleBtn = page.locator('#system-toggle-btn');
        await expect(toggleBtn).toBeAttached();
    });

    test('system toggle should have icon', async ({ page }) => {
        const toggleIcon = page.locator('#system-toggle-btn .toggle-icon');
        await expect(toggleIcon).toBeAttached();
    });

    test('system toggle should have text', async ({ page }) => {
        const toggleText = page.locator('#system-toggle-btn .toggle-text');
        await expect(toggleText).toBeAttached();
    });

});

test.describe('Responsive - Stats Section', () => {

    test('stats section should be in DOM on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const statsSection = page.locator('.stats-section');
        await expect(statsSection).toBeAttached();
    });

    test('all stat cards should be in DOM on tablet', async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('#stat-groups')).toBeAttached();
        await expect(page.locator('#stat-whitelist')).toBeAttached();
        await expect(page.locator('#stat-blocked')).toBeAttached();
        await expect(page.locator('#stat-pending-requests')).toBeAttached();
    });

});
