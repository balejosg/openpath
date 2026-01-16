import { test, expect } from '@playwright/test';

test('GitHub login button should not be visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#github-login-btn')).not.toBeVisible();
});
