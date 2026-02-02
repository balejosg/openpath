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
  waitForDashboard,
  waitForLoginPage,
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
    
    // Should show dashboard content (state-based navigation, no URL change)
    await waitForDashboard(page);
    
    // User should see authenticated content
    await expect(page.getByText(/Panel de Control|Vista General|Aulas/i)).toBeVisible();
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
    
    // Perform logout via sidebar button
    await logout(page);
    
    // Should show login form
    await waitForLoginPage(page);
    await loginPage.expectLoaded();
  });

  test('should persist session across page refreshes @auth', async ({ page }) => {
    // Login
    await loginAsAdmin(page);
    await waitForNetworkIdle(page);
    
    // Refresh the page
    await page.reload();
    await waitForNetworkIdle(page);
    
    // Should still be logged in (dashboard visible)
    await waitForDashboard(page);
    
    // User content should be visible
    await expect(page.getByText(/Panel de Control|Vista General|Aulas/i)).toBeVisible();
  });

  test('should redirect to login when session expires @auth', async ({ page, context }) => {
    // Login first
    await loginAsAdmin(page);
    await waitForNetworkIdle(page);
    
    // Clear localStorage to simulate session expiry
    await page.evaluate(() => localStorage.clear());
    
    // Refresh page
    await page.reload();
    await waitForNetworkIdle(page);
    
    // Should show login form
    await waitForLoginPage(page);
    await loginPage.expectLoaded();
  });

  test('should navigate to register page from login @auth', async ({ page }) => {
    await loginPage.expectLoaded();
    await loginPage.navigateToRegister();
    
    // Should show registration form (state-based, check for content)
    await expect(page.getByText(/Registro|Crear cuenta|Registrarse/i)).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
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
    
    // Navigate to register - look for any register link
    const registerLink = page.getByText(/Crear cuenta|Regístrate|Solicitar acceso/i).first();
    await registerLink.click();
    
    // Wait for register form
    await expect(page.getByText(/Registro|Crear cuenta/i)).toBeVisible({ timeout: 5000 });
    
    // Fill registration form - use flexible selectors
    const emailInput = page.locator('input[type="email"]');
    const nameInput = page.getByPlaceholder(/nombre/i);
    const passwordInputs = page.locator('input[type="password"]');
    
    await emailInput.fill(testUser.email);
    if (await nameInput.isVisible()) {
      await nameInput.fill(testUser.name);
    }
    await passwordInputs.first().fill(testUser.password);
    if (await passwordInputs.count() > 1) {
      await passwordInputs.last().fill(testUser.password);
    }
    
    // Check terms if present
    const termsCheckbox = page.getByRole('checkbox');
    if (await termsCheckbox.isVisible().catch(() => false)) {
      await termsCheckbox.check();
    }
    
    // Submit - look for any submit button
    const submitButton = page.getByRole('button', { name: /Crear|Registrar|Enviar/i });
    if (await submitButton.isEnabled()) {
      await submitButton.click();
    }
    
    // Should show success or redirect to dashboard/waiting
    await expect(page.getByText(/Bienvenido|Dashboard|verificar|Panel|esperando/i)).toBeVisible({ timeout: 10000 });
  });

  test('should show validation errors for invalid registration @auth @registration', async ({ page }) => {
    await page.goto('./');
    await page.waitForLoadState('networkidle');
    
    // Navigate to register
    const registerLink = page.getByText(/Crear cuenta|Regístrate|Solicitar acceso/i).first();
    await registerLink.click();
    
    // Wait for register form
    await expect(page.getByText(/Registro|Crear cuenta/i)).toBeVisible({ timeout: 5000 });
    
    // The submit button should be disabled when form is empty
    const submitButton = page.getByRole('button', { name: /Crear|Registrar|Enviar/i });
    await expect(submitButton).toBeDisabled();
  });

  test('should validate password confirmation match @auth @registration', async ({ page }) => {
    await page.goto('./');
    const registerLink = page.getByText(/Crear cuenta|Regístrate|Solicitar acceso/i).first();
    await registerLink.click();
    
    // Wait for form
    await expect(page.getByText(/Registro|Crear cuenta/i)).toBeVisible({ timeout: 5000 });
    
    // Fill with mismatched passwords
    const emailInput = page.locator('input[type="email"]');
    const passwordInputs = page.locator('input[type="password"]');
    
    await emailInput.fill('test@example.com');
    await passwordInputs.first().fill('Password123!');
    await passwordInputs.last().fill('DifferentPassword!');
    
    // Should show password mismatch error
    await expect(page.getByText(/coinciden|no coinciden|match/i)).toBeVisible({ timeout: 3000 });
  });
});
