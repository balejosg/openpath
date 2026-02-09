/**
 * Page Object Models for OpenPath E2E Tests
 *
 * Provides reusable abstractions for common UI interactions.
 */

import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly googleLoginButton: Locator;
  readonly registerLink: Locator;
  readonly errorMessage: Locator;
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[type="email"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.loginButton = page.getByRole('button', { name: 'Entrar' });
    this.googleLoginButton = page.getByRole('button', { name: /Google/i });
    this.registerLink = page.getByRole('button', { name: 'Solicitar acceso' });
    this.errorMessage = page.getByText('Credenciales inválidas');
    this.loadingSpinner = page.locator('.animate-spin');
  }

  async goto() {
    await this.page.goto('./');
    await this.page.waitForLoadState('networkidle');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async expectLoaded() {
    await expect(this.page.getByRole('heading', { name: 'Acceso Seguro' })).toBeVisible();
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
  }

  async expectError() {
    await expect(this.errorMessage).toBeVisible();
  }

  async navigateToRegister() {
    await this.registerLink.click();
    await expect(this.page.getByRole('heading', { name: 'Registro Institucional' })).toBeVisible();
  }
}

export class RegisterPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly nameInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly termsCheckbox: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByPlaceholder('correo@ejemplo.com');
    this.nameInput = page.getByPlaceholder('Tu nombre completo');
    this.passwordInput = page.locator('input[type="password"]').first();
    this.confirmPasswordInput = page.locator('input[type="password"]').last();
    this.termsCheckbox = page.getByLabel(/Acepto los/);
    this.submitButton = page.getByRole('button', { name: 'Registrarse' });
    this.errorMessage = page.locator('[role="alert"]');
  }

  async fillForm(data: { email: string; name: string; password: string }) {
    await this.emailInput.fill(data.email);
    await this.nameInput.fill(data.name);
    await this.passwordInput.fill(data.password);
    await this.confirmPasswordInput.fill(data.password);
    await this.termsCheckbox.check();
  }

  async submit() {
    await this.submitButton.click();
  }
}

export class DashboardPage {
  readonly page: Page;
  readonly activeGroupsStat: Locator;
  readonly allowedDomainsStat: Locator;
  readonly blockedSitesStat: Locator;
  readonly pendingRequestsStat: Locator;
  readonly systemStatusBanner: Locator;
  readonly auditFeed: Locator;
  readonly trafficChart: Locator;

  constructor(page: Page) {
    this.page = page;
    this.activeGroupsStat = page.getByText('Grupos Activos').locator('..');
    this.allowedDomainsStat = page.getByText('Dominios Permitidos').locator('..');
    this.blockedSitesStat = page.getByText('Sitios Bloqueados').locator('..');
    this.pendingRequestsStat = page.getByText('Solicitudes Pendientes').locator('..');
    this.systemStatusBanner = page.getByText('Estado del Sistema');
    this.auditFeed = page.getByText('Auditoría Reciente').locator('..');
    this.trafficChart = page.locator('[data-testid="traffic-chart"]');
  }

  async goto() {
    // SPA uses state-based navigation, click sidebar if already logged in
    // Otherwise just ensure we're on the page
    const sidebarDashboard = this.page.getByRole('button', { name: /Panel de Control/i });
    if (await sidebarDashboard.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sidebarDashboard.click();
    }
    await this.page.waitForLoadState('networkidle');
  }

  async expectLoaded() {
    await expect(this.activeGroupsStat).toBeVisible();
    await expect(this.systemStatusBanner).toBeVisible();
  }

  async getStatValue(statName: 'groups' | 'domains' | 'blocked' | 'pending'): Promise<string> {
    const statMap = {
      groups: this.activeGroupsStat,
      domains: this.allowedDomainsStat,
      blocked: this.blockedSitesStat,
      pending: this.pendingRequestsStat,
    };
    const value = await statMap[statName].locator('text=/\\d+/').textContent();
    return value || '0';
  }
}

export class GroupsPage {
  readonly page: Page;
  readonly newGroupButton: Locator;
  readonly groupList: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newGroupButton = page.getByRole('button', { name: /Nuevo Grupo/i });
    this.groupList = page.locator('[data-testid="group-list"]');
    this.searchInput = page.getByPlaceholder(/Buscar/i);
  }

  async goto() {
    // SPA uses state-based navigation, click sidebar
    const sidebarGroups = this.page.getByRole('button', { name: /Políticas de Grupo/i });
    if (await sidebarGroups.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sidebarGroups.click();
    }
    await this.page.waitForLoadState('networkidle');
  }

  async expectLoaded() {
    await expect(this.page.getByText(/Grupos y Políticas|Políticas de Grupo/i)).toBeVisible();
  }

  async getGroupCount(): Promise<number> {
    const groups = await this.page.locator('[data-testid="group-card"]').count();
    return groups;
  }

  async clickConfigureGroup(groupName: string) {
    const group = this.page.getByText(groupName).locator('..').locator('..');
    await group.getByRole('button', { name: /Configurar/i }).click();
  }

  async createGroup(name: string, description: string) {
    await this.newGroupButton.click();
    await this.page.getByLabel(/Nombre/i).fill(name);
    await this.page.getByLabel(/Descripción/i).fill(description);
    await this.page.getByRole('button', { name: /Crear|Guardar/i }).click();
  }
}

export class DomainRequestsPage {
  readonly page: Page;
  readonly filterDropdown: Locator;

  constructor(page: Page) {
    this.page = page;
    this.filterDropdown = page.getByRole('combobox');
  }

  async goto() {
    // SPA uses state-based navigation, click sidebar
    const domainsButton = this.page.getByRole('button', { name: /Control de Dominios/i });
    if (await domainsButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await domainsButton.click();
    }
    await this.page.waitForLoadState('networkidle');
  }

  async goto() {
    await this.page.goto('./requests');
    await this.page.waitForLoadState('networkidle');
  }

  async approveRequest(domain: string) {
    const row = this.page.getByText(domain).locator('..').locator('..');
    await row.getByRole('button', { name: /Aprobar/i }).click();
    await this.page.getByRole('button', { name: /Confirmar/i }).click();
  }

  async rejectRequest(domain: string, reason: string) {
    const row = this.page.getByText(domain).locator('..').locator('..');
    await row.getByRole('button', { name: /Rechazar/i }).click();
    await this.page.getByLabel(/Motivo|Razón/i).fill(reason);
    await this.page.getByRole('button', { name: /Confirmar/i }).click();
  }

  async getPendingCount(): Promise<number> {
    return await this.page.locator('[data-testid="request-row"][data-status="pending"]').count();
  }
}

export class UsersPage {
  readonly page: Page;
  readonly newUserButton: Locator;
  readonly userList: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newUserButton = page.getByRole('button', { name: /Nuevo Usuario|Añadir/i });
    this.userList = page.locator('[data-testid="user-list"]');
  }

  async goto() {
    await this.page.goto('./users');
    await this.page.waitForLoadState('networkidle');
  }

  async createUser(email: string, role: 'admin' | 'teacher') {
    await this.newUserButton.click();
    await this.page.getByLabel(/Email|Correo/i).fill(email);
    await this.page.getByRole('combobox', { name: /Rol/i }).selectOption(role);
    await this.page.getByRole('button', { name: /Crear|Guardar/i }).click();
  }
}

// Bulk Import Modal page object
export class BulkImportPage {
  readonly page: Page;
  readonly importButton: Locator;
  readonly modal: Locator;
  readonly textarea: Locator;
  readonly dropZone: Locator;
  readonly formatIndicator: Locator;
  readonly warningBox: Locator;
  readonly countDisplay: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // The import button in RulesManager has text "Importar" with Upload icon
    this.importButton = page.getByRole('button', { name: 'Importar' }).first();
    this.modal = page.getByRole('dialog');
    this.textarea = page.locator('textarea');
    this.dropZone = page.locator('[data-testid="drop-zone"]');
    this.formatIndicator = page.getByText(/Formato CSV detectado/i);
    this.warningBox = page.locator('.bg-amber-50');
    this.countDisplay = page.getByText(/dominios? detectados?/i);
    // Submit button in modal shows "Importar (N)" when there are domains
    this.submitButton = page.getByRole('dialog').getByRole('button', { name: /^Importar/ });
    this.cancelButton = page.getByRole('button', { name: /Cancelar/i });
  }

  /**
   * Navigate to group policies page, select a group, and open bulk import modal
   */
  async open(): Promise<void> {
    // Navigate to Políticas de Grupo via sidebar
    const groupsButton = this.page.getByRole('button', { name: /Políticas de Grupo/i });
    if (await groupsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await groupsButton.click();
      await this.page.waitForLoadState('networkidle');
    }

    // Wait for groups page to load
    await this.page.waitForTimeout(500);

    // Click the first "Configurar" button to open the config modal
    const configButton = this.page.getByRole('button', { name: /Configurar/i }).first();
    await configButton.waitFor({ state: 'visible', timeout: 5000 });
    await configButton.click();

    // Wait for modal to appear
    await this.page.waitForTimeout(300);

    // Click "Gestionar" link inside the modal to navigate to RulesManager
    const manageLink = this.page.getByRole('button', { name: /Gestionar/i });
    await manageLink.waitFor({ state: 'visible', timeout: 5000 });
    await manageLink.click();
    await this.page.waitForLoadState('networkidle');

    // Wait for RulesManager to load (look for the import button)
    await this.importButton.waitFor({ state: 'visible', timeout: 10000 });

    // Click the import button to open modal
    await this.importButton.click();
    await expect(this.modal).toBeVisible({ timeout: 5000 });
  }

  /**
   * Select a rule type in the modal
   */
  async selectRuleType(type: 'whitelist' | 'blocked_subdomain' | 'blocked_path'): Promise<void> {
    const labels: Record<string, string> = {
      whitelist: 'Dominios permitidos',
      blocked_subdomain: 'Subdominios bloqueados',
      blocked_path: 'Rutas bloqueadas',
    };
    await this.page.getByRole('button', { name: labels[type] }).click();
  }

  /**
   * Paste content directly into the textarea
   */
  async pasteContent(content: string): Promise<void> {
    await this.textarea.fill(content);
    // Wait for parsing to complete
    await this.page.waitForTimeout(100);
  }

  /**
   * Upload a file using the file input (simulates drag & drop)
   */
  async uploadFile(filePath: string): Promise<void> {
    // Create a file input element and trigger file selection
    const fileInput = await this.page.evaluateHandle(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.style.display = 'none';
      document.body.appendChild(input);
      return input;
    });

    await (fileInput as unknown as Locator).setInputFiles(filePath);

    // Read file content and paste it (since actual drag-drop is complex in Playwright)
    const fs = await import('fs');
    const content = fs.readFileSync(filePath, 'utf-8');
    await this.textarea.fill(content);
    await this.page.waitForTimeout(100);
  }

  /**
   * Get the number of detected domains
   */
  async getDetectedCount(): Promise<number> {
    const countText = await this.countDisplay.textContent();
    if (!countText) return 0;
    const match = countText.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Get the detected format type
   */
  async getFormat(): Promise<'plain-text' | 'csv-with-headers' | 'csv-simple' | 'unknown'> {
    const hasFormatIndicator = await this.formatIndicator.isVisible().catch(() => false);
    if (!hasFormatIndicator) {
      return 'plain-text';
    }
    const hasColumnInfo = await this.page
      .getByText(/columna:/i)
      .isVisible()
      .catch(() => false);
    return hasColumnInfo ? 'csv-with-headers' : 'csv-simple';
  }

  /**
   * Get all warning messages
   */
  async getWarnings(): Promise<string[]> {
    const warnings: string[] = [];
    const warningElements = this.warningBox.locator('div');
    const count = await warningElements.count();
    for (let i = 0; i < count; i++) {
      const text = await warningElements.nth(i).textContent();
      if (text) warnings.push(text);
    }
    return warnings;
  }

  /**
   * Get the column name being used (if CSV with headers)
   */
  async getColumnName(): Promise<string | null> {
    const columnInfo = this.page.getByText(/columna:/i);
    if (await columnInfo.isVisible().catch(() => false)) {
      const text = await columnInfo.textContent();
      const match = text?.match(/columna:\s*(\w+)/i);
      return match ? match[1] : null;
    }
    return null;
  }

  /**
   * Submit the import form
   */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * Close the modal without importing
   */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }

  /**
   * Check if the modal is open
   */
  async isOpen(): Promise<boolean> {
    return await this.modal.isVisible().catch(() => false);
  }
}

// Header navigation component
export class Header {
  readonly page: Page;
  readonly userMenu: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.userMenu = page.locator('[data-testid="user-menu"]');
    this.logoutButton = page.getByRole('menuitem', { name: /Cerrar sesión|Logout/i });
  }

  async logout() {
    await this.userMenu.click();
    await this.logoutButton.click();
  }
}
