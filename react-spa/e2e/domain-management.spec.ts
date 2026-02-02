/**
 * Domain Management E2E Tests for OpenPath
 * 
 * Tests domain requests, approvals, rejections, and whitelist management.
 */

import { test, expect } from '@playwright/test';
import { DomainRequestsPage, GroupsPage } from './fixtures/page-objects';
import { 
  loginAsAdmin, 
  loginAsTeacher,
  createTestDomain,
  waitForNetworkIdle,
  waitForToast,
  waitForDashboard
} from './fixtures/test-utils';

test.describe('Domain Request Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await waitForNetworkIdle(page);
  });

  test('should display pending domain requests @domains', async ({ page }) => {
    const requestsPage = new DomainRequestsPage(page);
    await requestsPage.goto();
    
    // Should show requests page
    await expect(page.getByText(/Solicitudes|Requests/i)).toBeVisible();
    
    // Should show filter options
    await expect(page.getByRole('combobox').or(page.getByRole('button', { name: /Filtrar/i }))).toBeVisible();
  });

  test('should approve a domain request @domains', async ({ page }) => {
    const requestsPage = new DomainRequestsPage(page);
    await requestsPage.goto();
    
    // Find a pending request (if any)
    const pendingRow = page.locator('[data-status="pending"]').first();
    
    if (await pendingRow.isVisible()) {
      const domain = await pendingRow.locator('[data-testid="domain-name"]').textContent();
      
      // Click approve
      await pendingRow.getByRole('button', { name: /Aprobar|Approve/i }).click();
      
      // Confirm in modal if present
      const confirmButton = page.getByRole('button', { name: /Confirmar|Confirm/i });
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }
      
      // Should show success message
      await expect(page.getByText(/aprobado|approved|éxito/i)).toBeVisible({ timeout: 5000 });
    } else {
      // No pending requests - test is valid but skipped
      test.skip(true, 'No pending requests available for testing');
    }
  });

  test('should reject a domain request with reason @domains', async ({ page }) => {
    const requestsPage = new DomainRequestsPage(page);
    await requestsPage.goto();
    
    // Find a pending request
    const pendingRow = page.locator('[data-status="pending"]').first();
    
    if (await pendingRow.isVisible()) {
      // Click reject
      await pendingRow.getByRole('button', { name: /Rechazar|Reject/i }).click();
      
      // Fill rejection reason in modal
      const reasonInput = page.getByLabel(/Motivo|Razón|Reason/i);
      if (await reasonInput.isVisible()) {
        await reasonInput.fill('Not allowed per school policy');
      }
      
      // Confirm rejection
      await page.getByRole('button', { name: /Confirmar|Confirm|Rechazar/i }).last().click();
      
      // Should show success message
      await expect(page.getByText(/rechazado|rejected|éxito/i)).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, 'No pending requests available for testing');
    }
  });

  test('should filter requests by status @domains', async ({ page }) => {
    const requestsPage = new DomainRequestsPage(page);
    await requestsPage.goto();
    
    // Open filter dropdown
    const filterButton = page.getByRole('combobox').or(page.getByRole('button', { name: /Filtrar|Estado/i }));
    await filterButton.click();
    
    // Select "Approved" filter
    await page.getByRole('option', { name: /Aprobad|Approved/i }).click().catch(async () => {
      // Alternative: click on text directly
      await page.getByText(/Aprobad|Approved/i).click();
    });
    
    await waitForNetworkIdle(page);
    
    // All visible requests should be approved
    const rows = page.locator('[data-testid="request-row"]');
    const count = await rows.count();
    
    for (let i = 0; i < count; i++) {
      const status = await rows.nth(i).getAttribute('data-status');
      expect(status).toBe('approved');
    }
  });

  test('should show domain details on click @domains', async ({ page }) => {
    const requestsPage = new DomainRequestsPage(page);
    await requestsPage.goto();
    
    // Click on first domain row
    const firstRow = page.locator('[data-testid="request-row"]').first();
    
    if (await firstRow.isVisible()) {
      await firstRow.click();
      
      // Should show details panel or modal
      await expect(page.getByText(/Detalles|Details|Información/i)).toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe('Teacher Domain Approval Workflow', () => {
  test('should allow teacher to view their group requests @domains @teacher', async ({ page }) => {
    await loginAsTeacher(page);
    await waitForNetworkIdle(page);
    
    // Navigate to requests via sidebar
    const requestsButton = page.getByRole('button', { name: /Control de Dominios|Solicitudes/i });
    if (await requestsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await requestsButton.click();
    }
    
    // Teacher should see request list or dashboard
    await expect(page.getByText(/Solicitudes|Requests|Panel|Dashboard/i)).toBeVisible();
  });

  test('should allow teacher to approve requests for their groups @domains @teacher', async ({ page }) => {
    await loginAsTeacher(page);
    await waitForNetworkIdle(page);
    
    // Navigate to requests via sidebar
    const requestsButton = page.getByRole('button', { name: /Control de Dominios|Solicitudes/i });
    if (await requestsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await requestsButton.click();
    }
    
    const pendingRow = page.locator('[data-status="pending"]').first();
    
    if (await pendingRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Teacher should have approve button
      const approveButton = pendingRow.getByRole('button', { name: /Aprobar|Approve/i });
      await expect(approveButton).toBeVisible();
    }
  });
});

test.describe('Whitelist Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await waitForNetworkIdle(page);
  });

  test('should display whitelist domains in group @domains @whitelist', async ({ page }) => {
    const groupsPage = new GroupsPage(page);
    await groupsPage.goto();
    
    // Click on first group
    const firstGroup = page.locator('[data-testid="group-card"]').first();
    
    if (await firstGroup.isVisible()) {
      await firstGroup.click();
      
      // Should show domains list
      await expect(page.getByText(/Dominios|Domains|Whitelist/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('should add domain to whitelist manually @domains @whitelist', async ({ page }) => {
    const groupsPage = new GroupsPage(page);
    await groupsPage.goto();
    
    // Open first group
    const firstGroup = page.locator('[data-testid="group-card"]').first();
    if (await firstGroup.isVisible()) {
      await firstGroup.click();
      await waitForNetworkIdle(page);
      
      // Click add domain
      const addButton = page.getByRole('button', { name: /Añadir|Add|Nuevo/i });
      if (await addButton.isVisible()) {
        await addButton.click();
        
        const testDomain = createTestDomain();
        
        // Fill domain form
        await page.getByLabel(/Dominio|Domain/i).fill(testDomain.domain);
        await page.getByRole('button', { name: /Guardar|Save|Añadir/i }).click();
        
        // Should show success
        await expect(page.getByText(/añadido|added|éxito/i)).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should remove domain from whitelist @domains @whitelist', async ({ page }) => {
    const groupsPage = new GroupsPage(page);
    await groupsPage.goto();
    
    const firstGroup = page.locator('[data-testid="group-card"]').first();
    if (await firstGroup.isVisible()) {
      await firstGroup.click();
      await waitForNetworkIdle(page);
      
      // Find a domain to remove
      const domainRow = page.locator('[data-testid="domain-row"]').first();
      if (await domainRow.isVisible()) {
        // Click remove/delete button
        await domainRow.getByRole('button', { name: /Eliminar|Remove|Delete/i }).click();
        
        // Confirm deletion
        await page.getByRole('button', { name: /Confirmar|Confirm|Sí/i }).click();
        
        // Should show success
        await expect(page.getByText(/eliminado|removed|éxito/i)).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should search domains within whitelist @domains @whitelist', async ({ page }) => {
    const groupsPage = new GroupsPage(page);
    await groupsPage.goto();
    
    const firstGroup = page.locator('[data-testid="group-card"]').first();
    if (await firstGroup.isVisible()) {
      await firstGroup.click();
      await waitForNetworkIdle(page);
      
      // Use search input
      const searchInput = page.getByPlaceholder(/Buscar|Search/i);
      if (await searchInput.isVisible()) {
        await searchInput.fill('google');
        await waitForNetworkIdle(page);
        
        // Results should be filtered
        const visibleDomains = page.locator('[data-testid="domain-row"]:visible');
        const count = await visibleDomains.count();
        
        // All visible domains should contain 'google'
        for (let i = 0; i < count; i++) {
          const text = await visibleDomains.nth(i).textContent();
          expect(text?.toLowerCase()).toContain('google');
        }
      }
    }
  });
});
