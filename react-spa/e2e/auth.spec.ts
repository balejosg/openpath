/**
 * Authentication E2E Tests for OpenPath
 * 
 * Tests login, logout, session management, and error handling.
 */

import { test, expect } from '@playwright/test';
import { LoginPage, Header } from './fixtures/page-objects';
import { 
  createTestUser, 
  loginAsAdmin, 
  logout,
  waitForNetworkIdle,
  ADMIN_CREDENTIALS 
} from './fixtures/test-utils';

test.describe('Authentication Flows', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('should login with valid credentials @auth', async ({ page }) => {
    await loginPage.expectLoaded();
    
    // Use admin credentials (assuming seeded test data)
    await loginPage.login(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
    
    // Should redirect to dashboard or groups
    await expect(page).toHaveURL(/\/(dashboard|groups)/);
    await waitForNetworkIdle(page);
    
    // User should see authenticated content
    await expect(page.getByText(/Dashboard|Grupos/)).toBeVisible();
  });

  test('should show error with invalid credentials @auth', async ({ page }) => {
    await loginPage.expectLoaded();
    
    // Login with wrong password
    await loginPage.login('invalid@email.com', 'wrongpassword');
    
    // Should show error message
    await expect(page.getByText(/Credenciales inválidas|Error|incorrecta/i)).toBeVisible({ timeout: 5000 });
    
    // Should stay on login page
    await expect(loginPage.emailInput).toBeVisible();
  });

  test('should logout and clear session @auth', async ({ page }) => {
    // First login
    await loginAsAdmin(page);
    await waitForNetworkIdle(page);
    
    // Perform logout
    const header = new Header(page);
    await header.logout();
    
    // Should redirect to login page
    await expect(page).toHaveURL(/\/(login)?$/);
    await loginPage.expectLoaded();
    
    // Trying to access protected route should redirect to login
    await page.goto('./dashboard');
    await expect(page).toHaveURL(/\/(login)?$/);
  });

  test('should persist session across page refreshes @auth', async ({ page }) => {
    // Login
    await loginAsAdmin(page);
    await waitForNetworkIdle(page);
    
    // Store current URL
    const currentUrl = page.url();
    
    // Refresh the page
    await page.reload();
    await waitForNetworkIdle(page);
    
    // Should still be logged in (not redirected to login)
    await expect(page).not.toHaveURL(/\/login$/);
    
    // User content should be visible
    await expect(page.getByText(/Dashboard|Grupos|Solicitudes/)).toBeVisible();
  });

  test('should redirect to login when session expires @auth', async ({ page, context }) => {
    // Login first
    await loginAsAdmin(page);
    await waitForNetworkIdle(page);
    
    // Clear cookies to simulate session expiry
    await context.clearCookies();
    
    // Try to access protected route
    await page.goto('./dashboard');
    await waitForNetworkIdle(page);
    
    // Should redirect to login
    await expect(page).toHaveURL(/\/(login)?$/);
    await loginPage.expectLoaded();
  });

  test('should navigate to register page from login @auth', async ({ page }) => {
    await loginPage.expectLoaded();
    await loginPage.navigateToRegister();
    
    // Should show registration form
    await expect(page.getByText('Registro Institucional')).toBeVisible();
    await expect(page.getByPlaceholder('correo@ejemplo.com')).toBeVisible();
  });

  test('should show loading state during login @auth', async ({ page }) => {
    await loginPage.expectLoaded();
    
    // Fill credentials
    await loginPage.emailInput.fill(ADMIN_CREDENTIALS.email);
    await loginPage.passwordInput.fill(ADMIN_CREDENTIALS.password);
    
    // Click login and immediately check for loading state
    await loginPage.loginButton.click();
    
    // Button should be disabled or show spinner during request
    await expect(loginPage.loginButton).toBeDisabled({ timeout: 1000 }).catch(() => {
      // If button is not disabled, check for spinner
      return expect(loginPage.loadingSpinner).toBeVisible({ timeout: 1000 });
    });
  });
});

test.describe('Registration Flow', () => {
  test('should register new user successfully @auth @registration', async ({ page }) => {
    const testUser = createTestUser();
    
    await page.goto('./');
    await page.waitForLoadState('networkidle');
    
    // Navigate to register
    await page.getByText('Solicitar acceso').click();
    await expect(page.getByText('Registro Institucional')).toBeVisible();
    
    // Fill registration form
    await page.getByPlaceholder('correo@ejemplo.com').fill(testUser.email);
    await page.getByPlaceholder('Tu nombre completo').fill(testUser.name);
    await page.locator('input[type="password"]').first().fill(testUser.password);
    await page.locator('input[type="password"]').last().fill(testUser.password);
    await page.getByLabel(/Acepto los/).check();
    
    // Submit
    await page.getByRole('button', { name: 'Registrarse' }).click();
    
    // Should redirect or show success
    await expect(page.getByText(/Bienvenido|Dashboard|verificar/i)).toBeVisible({ timeout: 10000 });
  });

  test('should show validation errors for invalid registration @auth @registration', async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('networkidle');
    
    // Navigate to register
    await page.getByText('Solicitar acceso').click();
    
    // Try to submit empty form
    await page.getByRole('button', { name: 'Registrarse' }).click();
    
    // Should show validation errors
    await expect(page.getByText(/requerido|obligatorio|inválido/i)).toBeVisible();
  });

  test('should validate password confirmation match @auth @registration', async ({ page }) => {
    await page.goto('./');
    await page.getByText('Solicitar acceso').click();
    
    // Fill with mismatched passwords
    await page.getByPlaceholder('correo@ejemplo.com').fill('test@example.com');
    await page.getByPlaceholder('Tu nombre completo').fill('Test User');
    await page.locator('input[type="password"]').first().fill('Password123!');
    await page.locator('input[type="password"]').last().fill('DifferentPassword!');
    await page.getByLabel(/Acepto los/).check();
    
    await page.getByRole('button', { name: 'Registrarse' }).click();
    
    // Should show password mismatch error
    await expect(page.getByText(/coinciden|match/i)).toBeVisible();
  });
});
