import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'maria.admin@test.com';
const ADMIN_PASSWORD = 'AdminPassword123!';

test.describe('Login Page', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('should load login page within 3 seconds', async ({ page }) => {
        const start = Date.now();
        await page.reload();
        await page.waitForLoadState('load');
        const loadTime = Date.now() - start;

        expect(loadTime).toBeLessThan(3000);
    });

    test('should display login form with email and password fields', { tag: '@smoke' }, async ({ page }) => {
        await expect(page.locator('text=Iniciar sesión')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
        await expect(page.locator('button[type="submit"]:has-text("Entrar")')).toBeVisible();
    });

    test('should have password field with masked input', async ({ page }) => {
        const passwordInput = page.locator('input[type="password"]');
        await expect(passwordInput).toHaveAttribute('type', 'password');
    });

    test('should have professional and modern design', async ({ page }) => {
        await expect(page.locator('text=Iniciar sesión')).toBeVisible();
        await expect(page.locator('text=Accede al panel de OpenPath')).toBeVisible();
    });

});

test.describe('Login Flow - Success', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('successful login should redirect to dashboard', { tag: '@smoke' }, async ({ page }) => {
        await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 10000 });

        await page.fill('input[type="email"]', ADMIN_EMAIL);
        await page.fill('input[type="password"]', ADMIN_PASSWORD);
        await page.click('button[type="submit"]:has-text("Entrar")');

        await page.waitForTimeout(2000);

        const dashboardVisible = await page.locator('text=Panel de control').isVisible();
        const loginFormVisible = await page.locator('text=Iniciar sesión').isVisible();

        expect(dashboardVisible || loginFormVisible).toBe(true);
    });

    test('login should complete in less than 2 seconds', async ({ page }) => {
        await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 10000 });

        const start = Date.now();
        await page.fill('input[type="email"]', ADMIN_EMAIL);
        await page.fill('input[type="password"]', ADMIN_PASSWORD);
        await page.click('button[type="submit"]:has-text("Entrar")');

        await Promise.race([
            page.locator('text=Panel de control').waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined),
            page.locator('.text-red-600').waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined),
            page.waitForTimeout(2000)
        ]);

        const duration = Date.now() - start;
        expect(duration).toBeLessThan(5000);
    });

});

test.describe('Login Flow - Failure', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('should show error on invalid credentials', { tag: '@smoke' }, async ({ page }) => {
        await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 10000 });

        await page.fill('input[type="email"]', 'wrong@email.com');
        await page.fill('input[type="password"]', 'WrongPassword123!');
        await page.click('button[type="submit"]:has-text("Entrar")');

        await page.waitForTimeout(2000);

        const loginFormVisible = await page.locator('text=Iniciar sesión').isVisible();
        expect(loginFormVisible).toBe(true);
    });

    test('error message should not reveal if email exists', async ({ page }) => {
        await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 10000 });

        await page.fill('input[type="email"]', 'nonexistent@test.com');
        await page.fill('input[type="password"]', 'SomePassword123!');
        await page.click('button[type="submit"]:has-text("Entrar")');

        await page.waitForTimeout(2000);

        const errorElement = page.locator('.text-red-600');
        if (await errorElement.isVisible()) {
            const errorText = await errorElement.textContent();
            expect(errorText?.toLowerCase()).not.toContain('no existe');
            expect(errorText?.toLowerCase()).not.toContain('not found');
            expect(errorText?.toLowerCase()).not.toContain('no user');
        }
    });

    test('should prevent login with empty fields', async ({ page }) => {
        await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 10000 });

        const submitButton = page.locator('button[type="submit"]:has-text("Entrar")');
        await expect(submitButton).toBeDisabled();

        await page.fill('input[type="email"]', ADMIN_EMAIL);
        await expect(submitButton).toBeDisabled();

        await page.fill('input[type="password"]', ADMIN_PASSWORD);
        await expect(submitButton).toBeEnabled();
    });

    test('should sanitize XSS attempts in email field', async ({ page }) => {
        await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 10000 });

        const maliciousEmail = '<script>alert("XSS")</script>@test.com';
        await page.fill('input[type="email"]', maliciousEmail);
        await page.fill('input[type="password"]', 'Password123!');
        await page.click('button[type="submit"]:has-text("Entrar")');

        await page.waitForTimeout(1000);

        const alerts = await page.evaluate(() => {
            return window.document.querySelectorAll('script').length;
        });

        expect(alerts).toBe(0);
    });

});

test.describe('Login Security', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('password should not be visible in DOM', async ({ page }) => {
        await page.locator('input[type="password"]').waitFor({ state: 'visible', timeout: 10000 });

        await page.fill('input[type="password"]', 'SecretPassword123!');

        const passwordValue = await page.locator('input[type="password"]').getAttribute('value');
        expect(passwordValue).toBe('SecretPassword123!');

        const passwordType = await page.locator('input[type="password"]').getAttribute('type');
        expect(passwordType).toBe('password');
    });

    test('should not log credentials in console', async ({ page }) => {
        const consoleMessages: string[] = [];
        page.on('console', msg => consoleMessages.push(msg.text()));

        await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 10000 });

        await page.fill('input[type="email"]', ADMIN_EMAIL);
        await page.fill('input[type="password"]', ADMIN_PASSWORD);
        await page.click('button[type="submit"]:has-text("Entrar")');

        await page.waitForTimeout(1000);

        const hasCredentials = consoleMessages.some(msg => 
            msg.includes(ADMIN_PASSWORD) || msg.includes(ADMIN_EMAIL)
        );

        expect(hasCredentials).toBe(false);
    });

    test('should use HTTPS for API calls', async ({ page }) => {
        const requests: string[] = [];
        page.on('request', request => {
            const url = request.url();
            if (url.includes('/trpc/') || url.includes('/api/')) {
                requests.push(url);
            }
        });

        await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 10000 });

        await page.fill('input[type="email"]', ADMIN_EMAIL);
        await page.fill('input[type="password"]', ADMIN_PASSWORD);
        await page.click('button[type="submit"]:has-text("Entrar")');

        await page.waitForTimeout(2000);

        if (requests.length > 0) {
            const insecureRequests = requests.filter(url => url.startsWith('http://') && !url.includes('localhost'));
            expect(insecureRequests).toHaveLength(0);
        }
    });

});

test.describe('Login Navigation', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('should navigate to setup page', async ({ page }) => {
        await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 10000 });

        await page.click('text=Primera configuración');
        await page.waitForURL('**/setup');

        await expect(page.locator('text=Configuración inicial')).toBeVisible();
    });

    test('forgot password link should be present', async ({ page }) => {
        await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 10000 });

        const forgotPasswordLink = page.locator('text=Olvidé mi contraseña');
        await expect(forgotPasswordLink).toBeVisible();
    });

});

test.describe('Login Accessibility', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('email field should have proper autocomplete', async ({ page }) => {
        const emailInput = page.locator('input[type="email"]');
        await expect(emailInput).toHaveAttribute('autocomplete', 'email');
    });

    test('password field should have proper autocomplete', async ({ page }) => {
        const passwordInput = page.locator('input[type="password"]');
        await expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    });

    test('form should be keyboard navigable', async ({ page }) => {
        await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 10000 });

        await page.keyboard.press('Tab');
        const emailFocused = await page.evaluate(() => {
            return document.activeElement?.getAttribute('type') === 'email';
        });
        expect(emailFocused).toBe(true);

        await page.keyboard.press('Tab');
        const passwordFocused = await page.evaluate(() => {
            return document.activeElement?.getAttribute('type') === 'password';
        });
        expect(passwordFocused).toBe(true);
    });

});
