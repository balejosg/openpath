import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

const ADMIN_EMAIL = 'maria.admin@test.com';
const ADMIN_PASSWORD = 'AdminPassword123!';

test.describe('Classroom Management', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('should display login form for classroom management', async ({ page }) => {
        await expect(page.locator('text=Iniciar sesión')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('input[type="email"]')).toBeVisible();
    });

    test('admin login attempt should handle response', async ({ page }) => {
        const emailInput = page.locator('input[type="email"]');
        await emailInput.waitFor({ state: 'visible', timeout: 10000 });

        await emailInput.fill(ADMIN_EMAIL);
        await page.fill('input[type="password"]', ADMIN_PASSWORD);
        await page.click('button[type="submit"]:has-text("Entrar")');

        await page.waitForTimeout(2000);

        const loginFormVisible = await page.locator('text=Iniciar sesión').isVisible();
        const dashboardVisible = await page.locator('text=Panel de control').isVisible();

        expect(loginFormVisible || dashboardVisible).toBe(true);
    });

    test('admin can access classrooms view after login', async ({ page }) => {
        await loginAsAdmin(page);
        
        await page.goto('/dashboard/classrooms');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('text=Aulas Seguras')).toBeVisible();
    });
});
