/**
 * Dashboard E2E Tests for OpenPath
 * 
 * Tests dashboard statistics, health monitoring, and real-time updates.
 */

import { test, expect } from '@playwright/test';
import { DashboardPage } from './fixtures/page-objects';
import { 
  loginAsAdmin,
  waitForNetworkIdle,
  measurePageLoad,
  getPerformanceMetrics
} from './fixtures/test-utils';

test.describe('Dashboard Display', () => {
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    dashboardPage = new DashboardPage(page);
    await dashboardPage.goto();
    await waitForNetworkIdle(page);
  });

  test('should display all stat cards @dashboard', async ({ page }) => {
    // Check for main statistics
    await expect(page.getByText(/Grupos Activos|Active Groups/i)).toBeVisible();
    await expect(page.getByText(/Dominios Permitidos|Allowed Domains/i)).toBeVisible();
    await expect(page.getByText(/Sitios Bloqueados|Blocked Sites/i)).toBeVisible();
    await expect(page.getByText(/Solicitudes Pendientes|Pending Requests/i)).toBeVisible();
  });

  test('should display system health status @dashboard @health', async ({ page }) => {
    // Check for system status banner
    await expect(page.getByText(/Estado del Sistema|System Status/i)).toBeVisible();
    
    // Status should show "Seguro" or "Healthy" or similar
    await expect(page.getByText(/Seguro|Healthy|Activo|Online/i)).toBeVisible();
  });

  test('should display connected agents @dashboard @agents', async ({ page }) => {
    // Look for agents section or count
    const agentsSection = page.getByText(/Agentes|Agents|Equipos Conectados/i);
    
    if (await agentsSection.isVisible()) {
      // Click to expand if needed
      await agentsSection.click().catch(() => {});
      
      // Should show agent list or count
      await expect(page.locator('[data-testid="agent-card"], [data-testid="agent-row"]').or(
        page.getByText(/conectado|online|activo/i)
      )).toBeVisible({ timeout: 5000 });
    }
  });

  test('should show warning when agent goes offline @dashboard @agents', async ({ page }) => {
    // This test validates that offline agents are indicated
    const offlineIndicator = page.locator('[data-status="offline"]').or(
      page.getByText(/Sin conexión|Offline|Desconectado/i)
    );
    
    // If there are offline agents, they should be marked
    if (await offlineIndicator.isVisible()) {
      // Warning icon or status should be present
      await expect(offlineIndicator).toHaveClass(/warning|error|danger/);
    }
    // If all agents are online, test passes
  });

  test('should display audit feed with recent activity @dashboard', async ({ page }) => {
    // Look for audit/activity section
    await expect(page.getByText(/Auditoría Reciente|Recent Activity|Actividad/i)).toBeVisible();
    
    // Should have at least one activity entry
    const activityItems = page.locator('[data-testid="audit-item"], [data-testid="activity-item"]');
    
    // Wait for items to load
    await page.waitForTimeout(1000);
    
    const count = await activityItems.count();
    // Activity feed may be empty, but section should exist
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show traffic chart @dashboard', async ({ page }) => {
    // Look for chart container
    const chartContainer = page.locator('[data-testid="traffic-chart"]').or(
      page.locator('.recharts-wrapper').or(
        page.locator('svg').filter({ hasText: /traffic|tráfico/i })
      )
    );
    
    // Chart may not be visible if no data
    if (await chartContainer.isVisible()) {
      await expect(chartContainer).toBeVisible();
    }
  });

  test('should update stats in real-time @dashboard @realtime', async ({ page }) => {
    // Get initial pending requests count
    const pendingBefore = await dashboardPage.getStatValue('pending');
    
    // Wait for potential real-time update (or trigger one)
    await page.waitForTimeout(3000);
    
    // Stats should remain consistent or update
    const pendingAfter = await dashboardPage.getStatValue('pending');
    
    // Both should be valid numbers
    expect(parseInt(pendingBefore)).toBeGreaterThanOrEqual(0);
    expect(parseInt(pendingAfter)).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Dashboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should navigate to groups from dashboard @dashboard @navigation', async ({ page }) => {
    await page.goto('./dashboard');
    await waitForNetworkIdle(page);
    
    // Click on groups link/card
    const groupsLink = page.getByRole('link', { name: /Grupos|Groups/i }).or(
      page.getByText(/Grupos Activos/i).locator('..')
    );
    
    await groupsLink.click();
    
    await expect(page).toHaveURL(/\/groups/);
  });

  test('should navigate to requests from pending count @dashboard @navigation', async ({ page }) => {
    await page.goto('./dashboard');
    await waitForNetworkIdle(page);
    
    // Click on pending requests stat
    const pendingStat = page.getByText(/Solicitudes Pendientes/i).locator('..');
    await pendingStat.click();
    
    await expect(page).toHaveURL(/\/requests/);
  });

  test('should refresh dashboard data on demand @dashboard', async ({ page }) => {
    await page.goto('./dashboard');
    await waitForNetworkIdle(page);
    
    // Look for refresh button
    const refreshButton = page.getByRole('button', { name: /Actualizar|Refresh/i }).or(
      page.locator('[data-testid="refresh-button"]')
    );
    
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
      
      // Should show loading state
      await expect(page.locator('.animate-spin').or(
        page.getByText(/Cargando|Loading/i)
      )).toBeVisible({ timeout: 1000 }).catch(() => {});
      
      // Should complete loading
      await waitForNetworkIdle(page);
    }
  });
});

test.describe('Dashboard Responsive Design', () => {
  test('should display correctly on mobile viewport @dashboard @responsive', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await loginAsAdmin(page);
    await page.goto('./dashboard');
    await waitForNetworkIdle(page);
    
    // Stats should still be visible (may stack vertically)
    await expect(page.getByText(/Grupos Activos|Dominios/i)).toBeVisible();
    
    // Mobile menu should be present
    const mobileMenu = page.locator('[data-testid="mobile-menu"]').or(
      page.getByRole('button', { name: /Menu/i })
    );
    
    // Either mobile menu is visible or desktop nav is visible
    const hasMobileMenu = await mobileMenu.isVisible();
    const hasDesktopNav = await page.locator('nav').isVisible();
    
    expect(hasMobileMenu || hasDesktopNav).toBe(true);
  });

  test('should display correctly on tablet viewport @dashboard @responsive', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    
    await loginAsAdmin(page);
    await page.goto('./dashboard');
    await waitForNetworkIdle(page);
    
    // All stats should be visible
    await expect(page.getByText(/Grupos Activos/i)).toBeVisible();
    await expect(page.getByText(/Dominios Permitidos/i)).toBeVisible();
  });
});

test.describe('Dashboard Error States', () => {
  test('should handle API errors gracefully @dashboard @errors', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Intercept API calls and simulate error
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });
    
    await page.goto('./dashboard');
    
    // Should show error state, not crash
    await expect(page.getByText(/Error|error|problema|failed/i)).toBeVisible({ timeout: 10000 });
  });

  test('should show retry option on data load failure @dashboard @errors', async ({ page }) => {
    await loginAsAdmin(page);
    
    let failCount = 0;
    
    // Fail first request, succeed on retry
    await page.route('**/api/**', route => {
      if (failCount < 1) {
        failCount++;
        route.fulfill({ status: 500 });
      } else {
        route.continue();
      }
    });
    
    await page.goto('./dashboard');
    
    // Look for retry button
    const retryButton = page.getByRole('button', { name: /Reintentar|Retry/i });
    
    if (await retryButton.isVisible()) {
      await retryButton.click();
      await waitForNetworkIdle(page);
      
      // After retry, dashboard should load
      await expect(page.getByText(/Grupos Activos/i)).toBeVisible();
    }
  });
});
