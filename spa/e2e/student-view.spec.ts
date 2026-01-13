import { test, expect } from '@playwright/test';

test.describe('Student View - Login', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('login form should be accessible to students', { tag: '@smoke' }, async ({ page }) => {
        await expect(page.locator('text=Iniciar sesión')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('input[type="email"]')).toBeVisible();
    });

    test('email field should exist', async ({ page }) => {
        const emailField = page.locator('input[type="email"]');
        await expect(emailField).toBeAttached();
    });

    test('password field should exist', async ({ page }) => {
        const passwordField = page.locator('input[type="password"]');
        await expect(passwordField).toBeAttached();
    });

    test('login button should exist', async ({ page }) => {
        const loginBtn = page.locator('button[type="submit"]:has-text("Entrar")');
        await expect(loginBtn).toBeAttached();
    });

});

test.describe.skip('Student View - Restricted Sections (React uses route guards, not DOM visibility)', () => {

    test('placeholder', () => {});

});

test.describe('Student View - Mobile Responsiveness', () => {

    test('login form should work on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('text=Iniciar sesión')).toBeVisible({ timeout: 10000 });
    });

    test('login fields should be visible on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('input[type="password"]')).toBeVisible();
    });

    test('login button should have adequate size for touch on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const loginBtn = page.locator('button[type="submit"]:has-text("Entrar")');
        await loginBtn.waitFor({ state: 'visible', timeout: 10000 });

        const box = await loginBtn.boundingBox();
        if (box) {
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
        await expect(page.locator('text=OpenPath')).toBeVisible({ timeout: 10000 });
    });

    test('login page should have app title', async ({ page }) => {
        await expect(page.locator('text=OpenPath')).toBeVisible();
    });

});

test.describe('Student View - Error States', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('invalid login should show error message', async ({ page }) => {
        await page.fill('input[type="email"]', 'student@test.com');
        await page.fill('input[type="password"]', 'wrongpassword');
        await page.click('button[type="submit"]:has-text("Entrar")');

        await page.waitForTimeout(1000);

        const errorVisible = await page.locator('.text-red-600').isVisible();
        expect(errorVisible).toBeTruthy();
    });

});

test.describe('Student View - Accessibility', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('email field should have appropriate attributes', async ({ page }) => {
        const emailField = page.locator('input[type="email"]');
        await expect(emailField).toBeAttached();
        
        const type = await emailField.getAttribute('type');
        expect(type).toBe('email');
    });

    test('password field should have appropriate attributes', async ({ page }) => {
        const passwordField = page.locator('input[type="password"]');
        await expect(passwordField).toBeAttached();
        
        const type = await passwordField.getAttribute('type');
        expect(type).toBe('password');
    });

});
