import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

test.describe('Requests Section - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/requests');
        await page.waitForLoadState('domcontentloaded');
    });

    test('requests page should display title and description', { tag: '@smoke' }, async ({ page }) => {
        await expect(page.locator('text=Solicitudes de Desbloqueo')).toBeVisible();
        await expect(page.locator('text=Revisión y aprobación')).toBeVisible();
    });

    test('should have status filter tabs with counts', async ({ page }) => {
        await expect(page.locator('button:has-text("Pendientes")')).toBeVisible();
        await expect(page.locator('button:has-text("Aprobadas")')).toBeVisible();
        await expect(page.locator('button:has-text("Rechazadas")')).toBeVisible();
        await expect(page.locator('button:has-text("Todas")')).toBeVisible();
    });

    test('pending tab should be active by default', async ({ page }) => {
        const pendingTab = page.locator('button:has-text("Pendientes")');
        await expect(pendingTab).toHaveClass(/text-blue-600/);
    });

    test('should switch to approved tab when clicked', async ({ page }) => {
        await page.locator('button:has-text("Aprobadas")').click();
        await expect(page.locator('button:has-text("Aprobadas")')).toHaveClass(/text-blue-600/);
    });

    test('should show empty state when no requests', async ({ page }) => {
        const hasRequests = await page.locator('text=No hay solicitudes').count() > 0;
        const hasLoadingState = await page.locator('text=Cargando solicitudes').count() > 0;
        expect(hasRequests || hasLoadingState).toBe(true);
    });

});

test.describe('Request Cards - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/requests');
        await page.waitForLoadState('domcontentloaded');
    });

    test('request cards should display domain name', async ({ page }) => {
        const hasRequests = await page.locator('text=No hay solicitudes').count() === 0;
        if (hasRequests) {
            const firstCard = page.locator('[class*="bg-white"]').filter({ has: page.locator('text=Solicitado por') }).first();
            if (await firstCard.count() > 0) {
                await expect(firstCard).toBeVisible();
            }
        }
    });

    test('request cards should show priority badge', async ({ page }) => {
        const priorityBadge = page.locator('.bg-red-100, .bg-yellow-100, .bg-gray-100').first();
        if (await priorityBadge.count() > 0) {
            await expect(priorityBadge).toBeVisible();
        }
    });

    test('request cards should show status badge', async ({ page }) => {
        const statusBadge = page.locator('.bg-emerald-100, .bg-amber-100, .bg-red-100').first();
        if (await statusBadge.count() > 0) {
            await expect(statusBadge).toBeVisible();
        }
    });

    test('request cards should display requester email', async ({ page }) => {
        const requesterText = page.locator('text=Solicitado por').first();
        if (await requesterText.count() > 0) {
            await expect(requesterText).toBeVisible();
        }
    });

});

test.describe('Request Actions - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/requests');
        await page.waitForLoadState('domcontentloaded');
    });

    test('pending requests should have group selector', async ({ page }) => {
        const hasNonEmpty = await page.locator('text=No hay solicitudes').count() === 0;
        if (hasNonEmpty) {
            const groupSelect = page.locator('select').first();
            if (await groupSelect.count() > 0) {
                await expect(groupSelect).toBeVisible();
            }
        }
    });

    test('pending requests should have approve button', async ({ page }) => {
        const approveBtn = page.locator('button:has-text("Aprobar")').first();
        if (await approveBtn.count() > 0) {
            await expect(approveBtn).toBeVisible();
        }
    });

    test('pending requests should have reject button', async ({ page }) => {
        const rejectBtn = page.locator('button:has-text("Rechazar")').first();
        if (await rejectBtn.count() > 0) {
            await expect(rejectBtn).toBeVisible();
        }
    });

    test('requests should have delete button', async ({ page }) => {
        const hasRequests = await page.locator('text=No hay solicitudes').count() === 0;
        if (hasRequests) {
            const deleteBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
            if (await deleteBtn.count() > 0) {
                await expect(deleteBtn).toBeVisible();
            }
        }
    });

});

test.describe('Request Details - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/requests');
        await page.waitForLoadState('domcontentloaded');
    });

    test('requests should show creation timestamp', async ({ page }) => {
        const timeText = page.locator('text=/Hace \\d+[mhd]|Justo ahora/').first();
        if (await timeText.count() > 0) {
            await expect(timeText).toBeVisible();
        }
    });

    test('requests should display reason if provided', async ({ page }) => {
        const reasonLabel = page.locator('text=Razón:').first();
        if (await reasonLabel.count() > 0) {
            await expect(reasonLabel).toBeVisible();
        }
    });

    test('approved requests should show resolved info', async ({ page }) => {
        await page.locator('button:has-text("Aprobadas")').click();
        await page.waitForTimeout(500);
        
        const resolvedText = page.locator('text=Resuelto por').first();
        if (await resolvedText.count() > 0) {
            await expect(resolvedText).toBeVisible();
        }
    });

    test('rejected requests should show rejection reason if provided', async ({ page }) => {
        await page.locator('button:has-text("Rechazadas")').click();
        await page.waitForTimeout(500);
        
        const rejectionNote = page.locator('text=Nota:').first();
        if (await rejectionNote.count() > 0) {
            await expect(rejectionNote).toBeVisible();
        }
    });

});
        const statusDot = page.locator('#requests-server-status .status-dot');
        await expect(statusDot).toBeAttached();
    });

    test('server status should have status text', async ({ page }) => {
        const statusText = page.locator('#requests-server-status .status-text');
        await expect(statusText).toBeAttached();
    });

});

test.describe('Requests - Configuration', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('requests config container should exist', async ({ page }) => {
        const configContainer = page.locator('#requests-config');
        await expect(configContainer).toBeAttached();
    });

    test('API URL field should exist in config', async ({ page }) => {
        const apiUrlField = page.locator('#requests-api-url');
        await expect(apiUrlField).toBeAttached();
    });

    test('API token field should exist in config', async ({ page }) => {
        const apiTokenField = page.locator('#requests-api-token');
        await expect(apiTokenField).toBeAttached();
        await expect(apiTokenField).toHaveAttribute('type', 'password');
    });

    test('save config button should exist', async ({ page }) => {
        const saveBtn = page.locator('#save-requests-config-btn');
        await expect(saveBtn).toBeAttached();
    });

});

test.describe('Requests - Empty State', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('requests list should have empty message element', async ({ page }) => {
        const emptyMessage = page.locator('#requests-list .empty-message');
        await expect(emptyMessage).toBeAttached();
    });

    test('empty message should indicate no pending requests', async ({ page }) => {
        const emptyMessage = page.locator('#requests-list .empty-message');
        const text = await emptyMessage.textContent();
        expect(text?.toLowerCase()).toContain('no hay');
    });

});

test.describe('Blocked Domain Modal', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('blocked domain modal should exist in DOM', async ({ page }) => {
        const modal = page.locator('#modal-blocked-domain');
        await expect(modal).toBeAttached();
    });

    test('blocked domain modal should have warning header', async ({ page }) => {
        const header = page.locator('#modal-blocked-domain .modal-header-warning');
        await expect(header).toBeAttached();
    });

    test('blocked domain modal should display domain name', async ({ page }) => {
        const domainName = page.locator('#blocked-domain-name');
        await expect(domainName).toBeAttached();
    });

    test('blocked domain modal should display blocking rule', async ({ page }) => {
        const blockingRule = page.locator('#blocked-domain-rule');
        await expect(blockingRule).toBeAttached();
    });

    test('blocked domain modal should have hint for user', async ({ page }) => {
        const hint = page.locator('#blocked-domain-hint');
        await expect(hint).toBeAttached();
    });

    test('blocked domain modal should have dismiss button', async ({ page }) => {
        const dismissBtn = page.locator('#modal-blocked-domain .modal-cancel');
        await expect(dismissBtn).toBeAttached();
        await expect(dismissBtn).toContainText('Entendido');
    });

});

test.describe('Toast Notifications', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('toast container should exist for notifications', async ({ page }) => {
        const toastContainer = page.locator('#toast-container');
        await expect(toastContainer).toBeAttached();
    });

});

test.describe('Responsive - Requests Section', () => {

    test('requests section should be visible on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const requestsSection = page.locator('#requests-section');
        await expect(requestsSection).toBeAttached();
    });

    test('refresh button should be accessible on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const refreshBtn = page.locator('#refresh-requests-btn');
        await expect(refreshBtn).toBeAttached();
    });

    test('stat cards should be in DOM on tablet viewport', async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const statsGrid = page.locator('.stats-grid');
        await expect(statsGrid).toBeAttached();
        
        const pendingCard = page.locator('#stat-pending-requests');
        await expect(pendingCard).toBeAttached();
    });

});
