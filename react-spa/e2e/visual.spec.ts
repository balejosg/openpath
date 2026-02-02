/**
 * Visual Regression Tests for OpenPath
 * 
 * Uses Playwright's screenshot comparison for visual consistency.
 * Run with: npx playwright test visual.spec.ts --update-snapshots to create baselines.
 */

import { test, expect } from '@playwright/test';
import { loginAsAdmin, waitForNetworkIdle } from './fixtures/test-utils';

test.describe('Visual Regression - Login Page', () => {
  test('login page desktop @visual @smoke', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./');
    await page.waitForLoadState('networkidle');
    
    // Wait for any animations to complete
    await page.waitForTimeout(500);
    
    await expect(page).toHaveScreenshot('login-desktop.png', {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });

  test('login page mobile @visual', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('./');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    
    await expect(page).toHaveScreenshot('login-mobile.png', {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });

  test('login page tablet @visual', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('./');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    
    await expect(page).toHaveScreenshot('login-tablet.png', {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });

  test('login page with error state @visual', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./');
    await page.waitForLoadState('networkidle');
    
    // Trigger error state
    await page.locator('input[type="email"]').fill('invalid@test.com');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.getByRole('button', { name: 'Entrar' }).click();
    
    // Wait for error to appear
    await page.getByText(/Credenciales|Error|inválid/i).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    
    await expect(page).toHaveScreenshot('login-error-state.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });
});

test.describe('Visual Regression - Register Page', () => {
  test('register page desktop @visual', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./');
    await page.waitForLoadState('networkidle');
    
    // Navigate to register
    await page.getByText('Solicitar acceso').click();
    await page.waitForTimeout(500);
    
    await expect(page).toHaveScreenshot('register-desktop.png', {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });

  test('register page mobile @visual', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('./');
    await page.getByText('Solicitar acceso').click();
    await page.waitForTimeout(500);
    
    await expect(page).toHaveScreenshot('register-mobile.png', {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });
});

test.describe('Visual Regression - Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await waitForNetworkIdle(page);
  });

  test('dashboard desktop @visual', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./dashboard');
    await waitForNetworkIdle(page);
    await page.waitForTimeout(1000); // Wait for charts to render
    
    await expect(page).toHaveScreenshot('dashboard-desktop.png', {
      maxDiffPixelRatio: 0.02, // Allow more variance for dynamic content
      animations: 'disabled',
    });
  });

  test('dashboard mobile @visual', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('./dashboard');
    await waitForNetworkIdle(page);
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveScreenshot('dashboard-mobile.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('dashboard empty state @visual', async ({ page }) => {
    // Mock empty data
    await page.route('**/api/**', route => {
      if (route.request().url().includes('stats')) {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            groups: 0,
            domains: 0,
            blocked: 0,
            pending: 0,
          }),
        });
      } else {
        route.continue();
      }
    });
    
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./dashboard');
    await waitForNetworkIdle(page);
    await page.waitForTimeout(500);
    
    await expect(page).toHaveScreenshot('dashboard-empty.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });
});

test.describe('Visual Regression - Groups Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('groups list desktop @visual', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./groups');
    await waitForNetworkIdle(page);
    await page.waitForTimeout(500);
    
    await expect(page).toHaveScreenshot('groups-list-desktop.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });

  test('groups list mobile @visual', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('./groups');
    await waitForNetworkIdle(page);
    await page.waitForTimeout(500);
    
    await expect(page).toHaveScreenshot('groups-list-mobile.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });
});

test.describe('Visual Regression - Domain Requests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('requests page desktop @visual', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./requests');
    await waitForNetworkIdle(page);
    await page.waitForTimeout(500);
    
    await expect(page).toHaveScreenshot('requests-desktop.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });
});

test.describe('Visual Regression - Dark Mode', () => {
  test('login page dark mode @visual @dark', async ({ page }) => {
    // Enable dark mode via media preference
    await page.emulateMedia({ colorScheme: 'dark' });
    
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    
    await expect(page).toHaveScreenshot('login-dark-mode.png', {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });

  test('dashboard dark mode @visual @dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./dashboard');
    await waitForNetworkIdle(page);
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveScreenshot('dashboard-dark-mode.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });
});
