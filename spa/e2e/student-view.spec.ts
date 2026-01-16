import { test, expect } from '@playwright/test';

// UAT Script: 03_alumno.md (Sections 4-5, 7)

test.describe('Student View - Login', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('login form should be accessible to students', { tag: '@smoke' }, async ({ page }) => {
        const loginForm = page.locator('#email-login-form');
        await expect(loginForm).toBeVisible({ timeout: 10000 });
    });

    test('email field should exist', async ({ page }) => {
        const emailField = page.locator('#login-email');
        await expect(emailField).toBeAttached();
    });

    test('password field should exist', async ({ page }) => {
        const passwordField = page.locator('#login-password');
        await expect(passwordField).toBeAttached();
    });

    test('login button should exist', async ({ page }) => {
        const loginBtn = page.locator('#email-login-btn');
        await expect(loginBtn).toBeAttached();
    });

});

test.describe('Student View - Restricted Sections', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('users section should be admin-only (hidden from students)', async ({ page }) => {
        const usersSection = page.locator('#users-section');
        const classNames = await usersSection.getAttribute('class');
        expect(classNames).toMatch(/admin-only|hidden/);
    });

    test('classrooms section should be admin-only (hidden from students)', async ({ page }) => {
        const classroomsSection = page.locator('#classrooms-section');
        const classNames = await classroomsSection.getAttribute('class');
        expect(classNames).toMatch(/admin-only|hidden/);
    });

    test('admin users button should be admin-only (hidden from students)', async ({ page }) => {
        const adminUsersBtn = page.locator('#admin-users-btn');
        const classNames = await adminUsersBtn.getAttribute('class');
        expect(classNames).toMatch(/admin-only|hidden/);
    });

});

test.describe('Student View - Accessible Elements', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('logout button should exist', async ({ page }) => {
        const logoutBtn = page.locator('#logout-btn');
        await expect(logoutBtn).toBeAttached();
    });

    test('theme toggle should be accessible', async ({ page }) => {
        const themeToggle = page.locator('#theme-toggle-btn');
        await expect(themeToggle).toBeAttached();
    });

    test('current user display should exist', async ({ page }) => {
        const currentUser = page.locator('#current-user');
        await expect(currentUser).toBeAttached();
    });

});

test.describe('Student View - Stats (Limited)', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('stats section should exist', async ({ page }) => {
        const statsSection = page.locator('.stats-section');
        await expect(statsSection).toBeAttached();
    });

    test('groups stat should exist', async ({ page }) => {
        const groupsStat = page.locator('#stat-groups');
        await expect(groupsStat).toBeAttached();
    });

});

test.describe('Student View - Mobile Responsiveness', () => {

    test('login form should work on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const loginForm = page.locator('#email-login-form');
        await expect(loginForm).toBeVisible({ timeout: 10000 });
    });

    test('login fields should be visible on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('#login-email')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#login-password')).toBeVisible();
    });

    test('login button should have adequate size for touch on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const loginBtn = page.locator('#email-login-btn');
        await loginBtn.waitFor({ state: 'visible', timeout: 10000 });

        const box = await loginBtn.boundingBox();
        if (box) {
            // Button should be at least 36px tall for touch (reasonable minimum)
            expect(box.height).toBeGreaterThanOrEqual(36);
        }
    });

});

test.describe('Student View - Usability', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('login page should have clear branding', async ({ page }) => {
        const logo = page.locator('#login-screen .login-header .logo');
        await expect(logo).toBeVisible({ timeout: 10000 });
    });

    test('login page should have app title', async ({ page }) => {
        const title = page.locator('#login-screen .login-header h1');
        await expect(title).toContainText('OpenPath');
    });

    test('login page should have description', async ({ page }) => {
        const description = page.locator('#login-screen .login-header p');
        await expect(description).toBeAttached();
    });

});

test.describe('Student View - Error States', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('login error element should exist', async ({ page }) => {
        const loginError = page.locator('#login-error');
        await expect(loginError).toBeAttached();
    });

});

test.describe('Student View - Accessibility', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('email field should have label', async ({ page }) => {
        const label = page.locator('label[for="login-email"]');
        await expect(label).toBeAttached();
    });

    test('password field should have label', async ({ page }) => {
        const label = page.locator('label[for="login-password"]');
        await expect(label).toBeAttached();
    });

    test('email field should have placeholder', async ({ page }) => {
        const emailField = page.locator('#login-email');
        const placeholder = await emailField.getAttribute('placeholder');
        expect(placeholder).toBeTruthy();
    });

});
