import { test, expect } from '@playwright/test';

test.describe('React App Smoke Tests', () => {
  test('should load the React app without errors @smoke', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto('/v2/');
    await page.waitForLoadState('networkidle');

    expect(errors).toHaveLength(0);
  });

  test('should render login page @smoke', async ({ page }) => {
    await page.goto('/v2/');
    
    await expect(page.locator('text=Iniciar sesión')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should navigate to setup page @smoke', async ({ page }) => {
    await page.goto('/v2/');
    
    // In React app, this might be handled differently or the text might be different.
    // If the test still fails, we should skip it until React app is confirmed stable.
    await page.click('text=Primera configuración');
    await page.waitForURL('**/setup');
    
    await expect(page.locator('text=Configuración inicial')).toBeVisible();
  });

  test('should have working React Router @smoke', async ({ page }) => {
    await page.goto('/v2/setup');
    await expect(page.locator('text=Configuración inicial')).toBeVisible();
    
    await page.goto('/v2/');
    await expect(page.locator('text=Iniciar sesión')).toBeVisible();
  });
});
