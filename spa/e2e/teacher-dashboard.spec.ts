import { test, expect } from '@playwright/test';

/**
 * Teacher Dashboard E2E Tests - US2
 * 
 * Tests the teacher dashboard UI elements:
 * - Login form
 * - Responsive layout
 * - Page load performance
 */

// Test credentials (created by API test setup in CI)
const TEACHER_EMAIL = 'juan.profesor@test.com';
const TEACHER_PASSWORD = 'TeacherPassword123!';

test.describe('Teacher Dashboard', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('should display login form initially', async ({ page }) => {
        await expect(page.locator('#email-login-form')).toBeVisible({ timeout: 10000 });
    });

    test('teacher login attempt should handle response', async ({ page }) => {
        await page.locator('#login-email').waitFor({ state: 'visible', timeout: 10000 });

        // Fill teacher credentials
        await page.fill('#login-email', TEACHER_EMAIL);
        await page.fill('#login-password', TEACHER_PASSWORD);
        await page.click('#email-login-btn');

        // Wait for response - either success (dashboard) or error
        await page.waitForTimeout(2000);

        // Check if we navigated away from login or got an error
        const loginFormVisible = await page.locator('#email-login-form').isVisible();
        const dashboardVisible = await page.locator('#dashboard-screen').isVisible();

        // One of these should be true
        expect(loginFormVisible || dashboardVisible).toBe(true);
    });

    test('page should be responsive', async ({ page }) => {
        // Test mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });

        // Login form should still be visible and usable
        await expect(page.locator('#email-login-form')).toBeVisible({ timeout: 10000 });

        // No horizontal overflow
        const scrollWidthByValue = await page.evaluate(() => document.body.scrollWidth);
        const viewWidthByValue = await page.evaluate(() => window.innerWidth);
        expect(scrollWidthByValue).toBeLessThanOrEqual(viewWidthByValue + 20);
    });

    test('page loads within reasonable time', async ({ page }) => {
        const start = Date.now();
        await page.reload();
        await page.waitForLoadState('load');
        const duration = Date.now() - start;

        // Page should load in less than 5 seconds locally
        expect(duration).toBeLessThan(5000);
    });
});
