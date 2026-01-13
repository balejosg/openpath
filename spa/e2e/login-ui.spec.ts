import { test, expect } from '@playwright/test';

test('Login page should display email/password form', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=Iniciar sesión')).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]:has-text("Entrar")')).toBeVisible();
});
