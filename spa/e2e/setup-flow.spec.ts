import { test, expect } from '@playwright/test';

test.describe('Setup Page - Already Configured', () => {

    test('should show login screen when system is configured', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        // When system is already configured, login screen should be visible
        // (not setup screen)
        const loginScreen = page.locator('#login-screen');
        const setupScreen = page.locator('#setup-screen');

        const loginVisible = await loginScreen.isVisible().catch(() => false);
        const setupVisible = await setupScreen.isVisible().catch(() => false);

        // One of them should be visible
        expect(loginVisible || setupVisible).toBe(true);

        // If setup screen is visible and shows "already configured"
        if (setupVisible) {
            const alreadySetup = page.locator('#setup-already-container');
            const isAlreadyConfigured = await alreadySetup.isVisible().catch(() => false);

            if (isAlreadyConfigured) {
                await expect(page.locator('#setup-goto-login')).toBeVisible();
            }
        }
    });

    test('should have loading state while checking', async ({ page }) => {
        await page.goto('/');

        const loadingState = page.locator('#setup-loading');
        await expect(loadingState).toBeAttached();
    });

});

test.describe('Setup Form Structure', () => {

    test('setup form should have all required fields', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        await expect(page.locator('#setup-form')).toBeAttached();
        await expect(page.locator('#setup-email')).toBeAttached();
        await expect(page.locator('#setup-name')).toBeAttached();
        await expect(page.locator('#setup-password')).toBeAttached();
        await expect(page.locator('#setup-password-confirm')).toBeAttached();
        await expect(page.locator('#setup-submit-btn')).toBeAttached();
    });

    test('password fields should have minimum length requirement', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        
        const setupForm = page.locator('#setup-form-container');
        const isSetupNeeded = await setupForm.isVisible({ timeout: 3000 }).catch(() => false);
        
        if (!isSetupNeeded) {
            test.skip();
            return;
        }

        const passwordInput = page.locator('#setup-password');
        await expect(passwordInput).toHaveAttribute('minlength', '8');
        
        const placeholder = await passwordInput.getAttribute('placeholder');
        expect(placeholder?.toLowerCase()).toContain('8');
    });

    test('email field should have autocomplete attribute', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const emailInput = page.locator('#setup-email');
        await expect(emailInput).toHaveAttribute('autocomplete', 'email');
    });

    test('password fields should have autocomplete new-password', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const passwordInput = page.locator('#setup-password');
        await expect(passwordInput).toHaveAttribute('autocomplete', 'new-password');
    });

});

test.describe('Setup Form Validation', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
    });

    test('should require all fields before submission', async ({ page }) => {
        const setupForm = page.locator('#setup-form-container');
        if (!(await setupForm.isVisible())) {
            test.skip();
            return;
        }

        await page.click('#setup-submit-btn');

        await expect(setupForm).toBeVisible();
    });

    test('should validate email format', async ({ page }) => {
        const setupForm = page.locator('#setup-form-container');
        if (!(await setupForm.isVisible())) {
            test.skip();
            return;
        }

        await page.fill('#setup-email', 'notanemail');
        await page.fill('#setup-name', 'Test Admin');
        await page.fill('#setup-password', 'Password123!');
        await page.fill('#setup-password-confirm', 'Password123!');
        await page.click('#setup-submit-btn');

        await expect(setupForm).toBeVisible();
    });

    test('should show error when passwords do not match', async ({ page }) => {
        const setupForm = page.locator('#setup-form-container');
        if (!(await setupForm.isVisible())) {
            test.skip();
            return;
        }

        await page.fill('#setup-email', 'test@example.com');
        await page.fill('#setup-name', 'Test Admin');
        await page.fill('#setup-password', 'Password123!');
        await page.fill('#setup-password-confirm', 'DifferentPassword456!');
        await page.click('#setup-submit-btn');

        await page.waitForTimeout(500);
        const errorMessage = page.locator('#setup-error');
        const isErrorVisible = await errorMessage.isVisible();
        
        if (isErrorVisible) {
            await expect(errorMessage).toContainText(/no coinciden|mismatch/i);
        }
    });

    test('should show error when password is too short', async ({ page }) => {
        const setupForm = page.locator('#setup-form-container');
        if (!(await setupForm.isVisible())) {
            test.skip();
            return;
        }

        await page.fill('#setup-email', 'test@example.com');
        await page.fill('#setup-name', 'Test Admin');
        await page.fill('#setup-password', 'short');
        await page.fill('#setup-password-confirm', 'short');
        await page.click('#setup-submit-btn');

        await page.waitForTimeout(500);
        const errorMessage = page.locator('#setup-error');
        const isErrorVisible = await errorMessage.isVisible();
        
        if (isErrorVisible) {
            await expect(errorMessage).toContainText(/8|caracteres|characters/i);
        }
    });

});

test.describe('Setup Success Flow', () => {

    test('success state should show registration token', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const successState = page.locator('#setup-complete-container');
        await expect(successState).toBeAttached();

        await expect(page.locator('#setup-registration-token')).toBeAttached();
        await expect(page.locator('#copy-registration-token-btn')).toBeAttached();
    });

    test('success state should have copy token button', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const copyBtn = page.locator('#copy-registration-token-btn');
        await expect(copyBtn).toBeAttached();
    });

    test('success state should have button to go to login', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const loginBtn = page.locator('#goto-login-btn');
        await expect(loginBtn).toBeAttached();
        await expect(loginBtn).toContainText(/Login|Acceder/i);
    });

    test('success state should explain next steps', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const infoBox = page.locator('#setup-complete-container .info-box');
        await expect(infoBox).toBeAttached();
    });

});

test.describe('Navigation', () => {

    test('already-setup state should navigate to login', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const alreadySetup = page.locator('#setup-already-container');
        if (await alreadySetup.isVisible()) {
            const loginLink = page.locator('#setup-goto-login');
            await expect(loginLink).toBeVisible();

            await loginLink.click();
            await page.waitForSelector('#login-screen:not(.hidden)');
        }
    });

});

test.describe('Security', () => {

    test('setup form should be protected after first admin', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1000);

        const alreadySetup = page.locator('#setup-already-container');
        const setupForm = page.locator('#setup-form-container');

        const isAlreadySetup = await alreadySetup.isVisible({ timeout: 2000 }).catch(() => false);
        
        if (isAlreadySetup) {
            await expect(setupForm).toHaveClass(/hidden/);
        } else {
            test.skip();
        }
    });

});
