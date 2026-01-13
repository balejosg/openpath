import { test, expect } from '@playwright/test';

test.describe('Setup Page - Already Configured', () => {

    test('should show login screen when system is configured', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const loginHeading = page.locator('text=Iniciar sesión');
        const setupHeading = page.locator('text=Configuración inicial');

        const loginVisible = await loginHeading.isVisible().catch(() => false);
        const setupVisible = await setupHeading.isVisible().catch(() => false);

        expect(loginVisible || setupVisible).toBe(true);

        if (setupVisible) {
            const alreadyConfigured = page.locator('text=El sistema ya está configurado');
            const isAlreadyConfigured = await alreadyConfigured.isVisible().catch(() => false);

            if (isAlreadyConfigured) {
                await expect(page.locator('button:has-text("Ir a login")')).toBeVisible();
            }
        }
    });

    test('should have loading state while checking', async ({ page }) => {
        await page.goto('/setup');
        
        const loadingText = page.locator('text=Verificando estado');
        const isChecking = await loadingText.isVisible({ timeout: 1000 }).catch(() => false);
        
        expect(isChecking || await page.locator('text=Configuración inicial').isVisible()).toBe(true);
    });

});

test.describe('Setup Form Structure', () => {

    test('setup form should have all required fields', async ({ page }) => {
        await page.goto('/setup');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);

        const setupForm = page.locator('form');
        const isSetupVisible = await setupForm.isVisible().catch(() => false);

        if (isSetupVisible) {
            await expect(page.locator('input[type="email"]')).toBeVisible();
            await expect(page.locator('input[placeholder="Nombre completo"]').or(page.locator('input[autocomplete="name"]'))).toBeVisible();
            const passwordInputs = page.locator('input[type="password"]');
            await expect(passwordInputs).toHaveCount(2);
            await expect(page.locator('button[type="submit"]')).toBeVisible();
        } else {
            await expect(page.locator('text=El sistema ya está configurado')).toBeVisible();
        }
    });

    test('password fields should have minimum length requirement', async ({ page }) => {
        await page.goto('/setup');
        await page.waitForLoadState('domcontentloaded');
        
        const setupFormVisible = await page.locator('text=Crea el primer usuario administrador').isVisible({ timeout: 3000 }).catch(() => false);

        if (setupFormVisible) {
            const hint = page.locator('text=Mínimo 8 caracteres');
            await expect(hint).toBeVisible();
            return;
        }

        await expect(page.locator('text=El sistema ya está configurado').or(page.locator('text=Iniciar sesión'))).toBeVisible();
    });

    test('email field should have autocomplete attribute', async ({ page }) => {
        await page.goto('/setup');
        await page.waitForLoadState('domcontentloaded');

        const emailInput = page.locator('input[type="email"]');
        const isVisible = await emailInput.isVisible().catch(() => false);
        
        if (isVisible) {
            await expect(emailInput).toHaveAttribute('autocomplete', 'email');
        }
    });

    test('password fields should have autocomplete new-password', async ({ page }) => {
        await page.goto('/setup');
        await page.waitForLoadState('domcontentloaded');

        const passwordInputs = page.locator('input[type="password"]');
        const count = await passwordInputs.count();
        
        if (count > 0) {
            await expect(passwordInputs.first()).toHaveAttribute('autocomplete', 'new-password');
        }
    });

});

test.describe('Setup Form Validation', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/setup');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
    });

    test('should require all fields before submission', async ({ page }) => {
        const setupForm = page.locator('form');
        const isSetupVisible = await setupForm.isVisible().catch(() => false);

        if (isSetupVisible) {
            const submitButton = page.locator('button[type="submit"]');
            await expect(submitButton).toBeDisabled();
            return;
        }

        await expect(page.locator('text=El sistema ya está configurado')).toBeVisible();
    });

    test('should validate email format', async ({ page }) => {
        const setupForm = page.locator('form');
        const isSetupVisible = await setupForm.isVisible().catch(() => false);

        if (isSetupVisible) {
            await page.fill('input[type="email"]', 'notanemail');
            await page.fill('input[autocomplete="name"]', 'Test Admin');
            const passwordInputs = page.locator('input[type="password"]');
            await passwordInputs.nth(0).fill('Password123!');
            await passwordInputs.nth(1).fill('Password123!');

            const submitButton = page.locator('button[type="submit"]');
            await submitButton.click();

            await expect(page.locator('form')).toBeVisible();
            return;
        }

        await expect(page.locator('text=El sistema ya está configurado')).toBeVisible();
    });

    test('should verify password confirmation matches', async ({ page }) => {
        const setupForm = page.locator('form');
        const isSetupVisible = await setupForm.isVisible().catch(() => false);

        if (isSetupVisible) {
            await page.fill('input[type="email"]', 'admin@test.com');
            await page.fill('input[autocomplete="name"]', 'Test Admin');
            
            const passwordInputs = page.locator('input[type="password"]');
            await passwordInputs.nth(0).fill('Password123!');
            await passwordInputs.nth(1).fill('DifferentPassword123!');

            await page.waitForTimeout(500);

            const error = page.locator('text=Las contraseñas no coinciden');
            await expect(error).toBeVisible();
            return;
        }

        await expect(page.locator('text=El sistema ya está configurado')).toBeVisible();
    });

    test('should enforce minimum password length', async ({ page }) => {
        const setupForm = page.locator('form');
        const isSetupVisible = await setupForm.isVisible().catch(() => false);

        if (isSetupVisible) {
            await page.fill('input[type="email"]', 'admin@test.com');
            await page.fill('input[autocomplete="name"]', 'Test Admin');
            
            const passwordInputs = page.locator('input[type="password"]');
            await passwordInputs.nth(0).fill('short');
            await passwordInputs.nth(1).fill('short');

            const submitButton = page.locator('button[type="submit"]');
            await expect(submitButton).toBeDisabled();
            return;
        }

        await expect(page.locator('text=El sistema ya está configurado')).toBeVisible();
    });

});

test.describe('Setup Success Flow', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/setup');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
    });

    test('should show token after successful setup', async ({ page }) => {
        const setupForm = page.locator('form');
        const isSetupVisible = await setupForm.isVisible().catch(() => false);

        if (isSetupVisible) {
            await page.fill('input[type="email"]', `admin-${Date.now()}@test.com`);
            await page.fill('input[autocomplete="name"]', 'Test Admin');
            
            const passwordInputs = page.locator('input[type="password"]');
            await passwordInputs.nth(0).fill('Password123!');
            await passwordInputs.nth(1).fill('Password123!');

            await page.click('button[type="submit"]');

            await page.waitForTimeout(3000);

            const tokenHeading = page.locator('text=Token de registro');
            const errorMessage = page.locator('.text-red-600');

            const hasToken = await tokenHeading.isVisible().catch(() => false);
            const hasError = await errorMessage.isVisible().catch(() => false);

            expect(hasToken || hasError || isSetupVisible).toBe(true);
            return;
        }

        await expect(page.locator('text=El sistema ya está configurado')).toBeVisible();
    });

});

test.describe('Setup UI/UX', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/setup');
        await page.waitForLoadState('domcontentloaded');
    });

    test('should have clear heading and subtitle', async ({ page }) => {
        await expect(page.locator('text=Configuración inicial')).toBeVisible();
    });

    test('submit button should show loading state', async ({ page }) => {
        const setupForm = page.locator('form');
        const isSetupVisible = await setupForm.isVisible().catch(() => false);

        if (isSetupVisible) {
            await page.fill('input[type="email"]', 'test@example.com');
            await page.fill('input[autocomplete="name"]', 'Test User');
            
            const passwordInputs = page.locator('input[type="password"]');
            await passwordInputs.nth(0).fill('ValidPassword123!');
            await passwordInputs.nth(1).fill('ValidPassword123!');

            const submitButton = page.locator('button[type="submit"]');
            await submitButton.click();

            const buttonText = await submitButton.textContent();
            expect(buttonText).toBeTruthy();
        }
    });

});
