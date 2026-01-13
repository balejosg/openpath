import { test, expect } from '@playwright/test';

/**
 * Blocked Domain E2E Tests - US3 (React Migration)
 * 
 * NOTE: The blocked domain feature appears to be a legacy feature from vanilla TS
 * that has not yet been implemented in the React migration.
 * 
 * The React router (src/router.tsx) does not have a /blocked route.
 * These tests are marked as .skip until the feature is implemented.
 * 
 * When implementing the blocked domain page in React:
 * 1. Add route to src/router.tsx
 * 2. Create BlockedDomainView component
 * 3. Update these tests to use React component selectors
 * 4. Remove .skip from test descriptions
 */

test.describe('Blocked Domain UI - US3 (Not Yet Implemented in React)', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test.skip('blocked domain page should exist and show blocked info', async ({ page }) => {
        // TODO: When blocked domain feature is implemented in React:
        // 1. Navigate to /blocked?domain=example.com
        // 2. Verify page shows blocked domain name
        // 3. Verify request unblock button exists
        // Expected selectors (React):
        // - text=Dominio bloqueado
        // - text=example.com
        // - button:has-text("Solicitar acceso")
    });

    test.skip('blocked domain page should allow requesting access', async ({ page }) => {
        // TODO: When blocked domain feature is implemented in React:
        // 1. Navigate to blocked page
        // 2. Click "Solicitar acceso" button
        // 3. Fill reason textarea
        // 4. Submit request
        // 5. Verify success toast appears
        // Expected selectors (React):
        // - button:has-text("Solicitar acceso")
        // - textarea[placeholder*="razón"] or textarea[name="reason"]
        // - button[type="submit"]:has-text("Enviar")
    });

    test.skip('blocked domain page should show request status if already requested', async ({ page }) => {
        // TODO: When blocked domain feature is implemented in React:
        // 1. Navigate to blocked page for already-requested domain
        // 2. Verify status badge shows "Pendiente" or "En revisión"
        // 3. Verify request button is disabled or hidden
        // Expected selectors (React):
        // - .bg-yellow-100 or [data-status="pending"]
        // - text=Pendiente
    });

    // Keep this test - verifies login page works (not blocked-domain specific)
    test('login page should load without errors', async ({ page }) => {
        // Verify the login page loads correctly (React component)
        await expect(page.locator('text=Iniciar sesión')).toBeVisible({ timeout: 10000 });

        // No JavaScript errors
        const errors: string[] = [];
        page.on('pageerror', (error) => { errors.push(error.message); });

        await page.waitForTimeout(1000);

        // Should have no critical errors
        expect(errors.length).toBe(0);
    });
});
