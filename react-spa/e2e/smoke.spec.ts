import { test, expect } from '@playwright/test';

test.describe('React App Smoke Tests', () => {
  test('should load the React app without errors @smoke', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto('./');
    await page.waitForLoadState('networkidle');

    expect(errors).toHaveLength(0);
  });

  test('should render login page @smoke', async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('networkidle');

    // Check for actual React app login page elements
    await expect(page.getByText('Acceso Seguro')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });

  test('should navigate to register page @smoke', async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('networkidle');

    // React app has "Solicitar acceso" instead of "Primera configuración"
    const registerLink = page.getByText('Solicitar acceso');
    await expect(registerLink).toBeVisible();
    await registerLink.click();

    // Should show registration form
    await expect(page.getByText('Registro Institucional')).toBeVisible();
  });
});
