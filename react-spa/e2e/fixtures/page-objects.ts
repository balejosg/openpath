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
