import { test, expect } from '@playwright/test';


test.describe('UI Sanity (baseline-free)', () => {
    test('login page should render key elements', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('#email-login-form')).toBeVisible();
        await expect(page.locator('#login-email')).toBeVisible();
        await expect(page.locator('#login-password')).toBeVisible();
        await expect(page.locator('#email-login-btn')).toBeVisible();

        await expect(page.locator('#login-error')).toBeHidden();
    });

    test('login page should have no horizontal scroll on mobile viewport', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });

        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const hasHorizontalOverflow = await page.evaluate(() => {
            const doc = document.documentElement;
            return doc.scrollWidth > doc.clientWidth;
        });

        expect(hasHorizontalOverflow).toBe(false);
    });

    test('login page primary action should be reachable on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });

        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const submit = page.locator('#email-login-btn');
        await expect(submit).toBeVisible();

        const box = await submit.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
            expect(box.width).toBeGreaterThan(40);
            expect(box.height).toBeGreaterThan(32);
        }
    });
});
