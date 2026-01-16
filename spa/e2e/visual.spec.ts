import { test, expect } from '@playwright/test';

/**
 * Visual Regression Tests
 *
 * Captures and compares screenshots of key UI components to detect
 * unintended styling changes.
 *
 * NOTE: These tests require screenshot baselines to be generated first.
 * Run with --update-snapshots to generate baselines:
 *   npx playwright test visual.spec.ts --update-snapshots
 *
 * Skip in CI unless baselines are committed.
 */

const SKIP_VISUAL_TESTS = process.env.SKIP_VISUAL_TESTS !== 'false';

test.describe('Visual Regression', () => {
    test.skip(() => SKIP_VISUAL_TESTS, 'Visual tests skipped (set SKIP_VISUAL_TESTS=false to run)');

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('login page visual appearance', async ({ page }) => {
        // Wait for login form to be stable
        await page.locator('#email-login-form').waitFor({ state: 'visible' });
        
        // Take screenshot and compare with baseline
        await expect(page).toHaveScreenshot('login-page.png', {
            fullPage: true,
            mask: [page.locator('#login-password')] // Mask password field if needed
        });
    });

    test('mobile login page visual appearance', async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });
        
        await page.locator('#email-login-form').waitFor({ state: 'visible' });
        
        await expect(page).toHaveScreenshot('login-page-mobile.png', {
            fullPage: true
        });
    });
});
