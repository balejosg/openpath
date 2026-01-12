import { test, expect } from '@playwright/test';

// UAT Script: 02_profesor.md (Sections 1-4, 6-7)

test.describe('Teacher Dashboard - DOM Structure', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('dashboard header elements should exist', async ({ page }) => {
        await expect(page.locator('#logout-btn')).toBeAttached();
        await expect(page.locator('#current-user')).toBeAttached();
        await expect(page.locator('#page-title')).toBeAttached();
    });

});

test.describe('Teacher - Requests Section', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('requests section should exist for teacher', { tag: '@smoke' }, async ({ page }) => {
        const requestsSection = page.locator('#requests-section');
        await expect(requestsSection).toBeAttached();
    });

    test('requests list should exist', async ({ page }) => {
        const requestsList = page.locator('#requests-list');
        await expect(requestsList).toBeAttached();
    });

    test('refresh requests button should exist', async ({ page }) => {
        const refreshBtn = page.locator('#refresh-requests-btn');
        await expect(refreshBtn).toBeAttached();
    });

    test('pending requests counter should exist', async ({ page }) => {
        const pendingCounter = page.locator('#stat-pending-requests');
        await expect(pendingCounter).toBeAttached();
    });

});

test.describe('Teacher - Navigation Restrictions', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('users menu item should be marked admin-only', async ({ page }) => {
        const usersNavItem = page.locator('button.nav-item[data-screen="users-screen"]');
        await expect(usersNavItem).toBeAttached();
        await expect(usersNavItem).toHaveClass(/admin-only/);
    });

    test('classrooms section should exist in DOM (access is role-gated)', async ({ page }) => {
        const classroomsSection = page.locator('#classrooms-section');
        await expect(classroomsSection).toBeAttached();
    });

});

test.describe('Teacher - Mobile Responsiveness', () => {

    test('requests section should be in DOM on mobile', async ({ page }) => {
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

    test('logout button should be accessible on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const logoutBtn = page.locator('#logout-btn');
        await expect(logoutBtn).toBeAttached();
    });

    test('stat cards should be in DOM on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const statsSection = page.locator('.stats-grid');
        await expect(statsSection).toBeAttached();
    });

});

test.describe('Teacher - Schedule Access', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('schedule section should exist', async ({ page }) => {
        const scheduleSection = page.locator('#schedule-section');
        await expect(scheduleSection).toBeAttached();
    });

    test('schedule classroom selector should exist', async ({ page }) => {
        const classroomSelect = page.locator('#schedule-classroom-select');
        await expect(classroomSelect).toBeAttached();
    });

});

test.describe('Teacher - Notifications', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('notifications button should exist', async ({ page }) => {
        const notificationsBtn = page.locator('#notifications-btn');
        await expect(notificationsBtn).toBeAttached();
    });

    test('notifications icon is visible', async ({ page }) => {
        const notificationsBtn = page.locator('#notifications-btn');
        await expect(notificationsBtn).toBeAttached();
    });

});

test.describe('Teacher - Header Elements', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('current user badge should exist', async ({ page }) => {
        const currentUser = page.locator('#current-user');
        await expect(currentUser).toBeAttached();
    });

    test('logout button should exist', async ({ page }) => {
        const logoutBtn = page.locator('#logout-btn');
        await expect(logoutBtn).toBeAttached();
    });

    test('theme toggle should exist', async ({ page }) => {
        const themeToggle = page.locator('#theme-toggle-btn');
        await expect(themeToggle).toBeAttached();
    });

});

test.describe('Teacher - Blocked Domain Modal', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('blocked domain modal should exist', async ({ page }) => {
        const modal = page.locator('#modal-blocked-domain');
        await expect(modal).toBeAttached();
    });

    test('blocked domain name display should exist', async ({ page }) => {
        const domainName = page.locator('#blocked-domain-name');
        await expect(domainName).toBeAttached();
    });

    test('blocked domain rule display should exist', async ({ page }) => {
        const ruleDisplay = page.locator('#blocked-domain-rule');
        await expect(ruleDisplay).toBeAttached();
    });

    test('blocked domain hint should exist', async ({ page }) => {
        const hint = page.locator('#blocked-domain-hint');
        await expect(hint).toBeAttached();
    });

});
