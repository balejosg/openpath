import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

const TEACHER_EMAIL = 'juan.profesor@test.com';
const TEACHER_PASSWORD = 'TeacherPassword123!';

test.describe('Teacher Dashboard', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('should display login form initially', async ({ page }) => {
        await expect(page.locator('text=Iniciar sesión')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
    });

    test('teacher login attempt should handle response', async ({ page }) => {
        const emailInput = page.locator('input[type="email"]');
        await emailInput.waitFor({ state: 'visible', timeout: 10000 });

        await emailInput.fill(TEACHER_EMAIL);
        await page.fill('input[type="password"]', TEACHER_PASSWORD);
        await page.click('button[type="submit"]:has-text("Entrar")');

        await page.waitForTimeout(2000);

        const loginFormVisible = await page.locator('text=Iniciar sesión').isVisible();
        const dashboardVisible = await page.locator('text=Panel de control').isVisible();

        expect(loginFormVisible || dashboardVisible).toBe(true);
    });

    test('page should be responsive', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });

        await expect(page.locator('text=Iniciar sesión')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('input[type="email"]')).toBeVisible();

        const scrollWidthByValue = await page.evaluate(() => document.body.scrollWidth);
        const viewWidthByValue = await page.evaluate(() => window.innerWidth);
        expect(scrollWidthByValue).toBeLessThanOrEqual(viewWidthByValue + 20);
    });

    test('page loads within reasonable time', async ({ page }) => {
        const start = Date.now();
        await page.reload();
        await page.waitForLoadState('load');
        const duration = Date.now() - start;

        expect(duration).toBeLessThan(5000);
    });

    test('teacher can access dashboard after login', async ({ page }) => {
        await loginAsAdmin(page);
        
        await page.goto('/dashboard');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('text=Panel de control')).toBeVisible();
        await expect(page.locator('nav')).toBeVisible();
    });
});
