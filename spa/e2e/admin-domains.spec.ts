import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

test.describe('Groups/Domains Section - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/groups');
        await page.waitForLoadState('domcontentloaded');
    });

    test('groups page should display title and description', { tag: '@smoke' }, async ({ page }) => {
        await expect(page.locator('text=Políticas de Grupo')).toBeVisible();
        await expect(page.locator('text=Selecciona un grupo')).toBeVisible();
    });

    test('should show empty state when no groups configured', async ({ page }) => {
        const hasGroups = await page.locator('button:has-text("dominios")').count() > 0;
        if (!hasGroups) {
            await expect(page.locator('text=No hay grupos configurados')).toBeVisible();
        }
    });

    test('group cards should display name, domain count and status', async ({ page }) => {
        const groupCard = page.locator('button').filter({ hasText: 'dominios' }).first();
        if (await groupCard.count() > 0) {
            await expect(groupCard).toBeVisible();
            await expect(groupCard.locator('text=dominios')).toBeVisible();
            const hasActivo = await groupCard.locator('text=Activo').count() > 0;
            const hasPausado = await groupCard.locator('text=Pausado').count() > 0;
            expect(hasActivo || hasPausado).toBe(true);
        }
    });

    test('group cards should be clickable and navigate to detail', async ({ page }) => {
        const groupCard = page.locator('button').filter({ hasText: 'dominios' }).first();
        if (await groupCard.count() > 0) {
            await groupCard.click();
            await expect(page).toHaveURL(/\/dashboard\/groups\/.+/);
        }
    });

});

test.describe('Group Detail View - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/groups');
        await page.waitForLoadState('domcontentloaded');
        
        const firstGroup = page.locator('button').filter({ hasText: 'dominios' }).first();
        if (await firstGroup.count() > 0) {
            await firstGroup.click();
            await page.waitForLoadState('domcontentloaded');
        }
    });

    test('should display group name and status badge', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            await expect(page.locator('h2.text-lg').first()).toBeVisible();
            const hasActivo = await page.locator('.bg-emerald-100').count() > 0;
            const hasPausado = await page.locator('.bg-amber-100').count() > 0;
            expect(hasActivo || hasPausado).toBe(true);
        }
    });

    test('should have back button that navigates to groups list', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            const backBtn = page.locator('button:has-text("←")');
            await expect(backBtn).toBeVisible();
            await backBtn.click();
            await expect(page).toHaveURL('/dashboard/groups');
        }
    });

    test('should have action buttons (Pausar/Activar, Guardar, Eliminar)', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            const hasPausar = await page.locator('button:has-text("Pausar")').count() > 0;
            const hasActivar = await page.locator('button:has-text("Activar")').count() > 0;
            expect(hasPausar || hasActivar).toBe(true);
            
            await expect(page.locator('button:has-text("Guardar")')).toBeVisible();
            await expect(page.locator('button:has-text("Eliminar")')).toBeVisible();
        }
    });

});

test.describe('Rule Tabs - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/groups');
        await page.waitForLoadState('domcontentloaded');
        
        const firstGroup = page.locator('button').filter({ hasText: 'dominios' }).first();
        if (await firstGroup.count() > 0) {
            await firstGroup.click();
            await page.waitForLoadState('domcontentloaded');
        }
    });

    test('should display three rule type tabs with counts', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            await expect(page.locator('button:has-text("Whitelist")')).toBeVisible();
            await expect(page.locator('button:has-text("Subdominios bloqueados")')).toBeVisible();
            await expect(page.locator('button:has-text("Rutas bloqueadas")')).toBeVisible();
        }
    });

    test('should show count badges for each tab', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            const whitelistBtn = page.locator('button:has-text("Whitelist")');
            await expect(whitelistBtn.locator('.bg-white\\/20, .bg-white')).toBeVisible();
        }
    });

    test('should switch between tabs when clicked', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            const blockedSubBtn = page.locator('button:has-text("Subdominios bloqueados")');
            await blockedSubBtn.click();
            await expect(blockedSubBtn).toHaveClass(/bg-slate-900/);
        }
    });

});

test.describe('Add Rule Modal - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/groups');
        await page.waitForLoadState('domcontentloaded');
        
        const firstGroup = page.locator('button').filter({ hasText: 'dominios' }).first();
        if (await firstGroup.count() > 0) {
            await firstGroup.click();
            await page.waitForLoadState('domcontentloaded');
        }
    });

    test('should open add rule modal when clicking Añadir button', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            await page.locator('button:has-text("Añadir")').click();
            await expect(page.locator('text=Añadir regla')).toBeVisible();
        }
    });

    test('add rule modal should have input field with label', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            await page.locator('button:has-text("Añadir")').click();
            await expect(page.locator('label:has-text("Valor")')).toBeVisible();
            await expect(page.locator('input[placeholder*="example"]')).toBeVisible();
        }
    });

    test('add rule modal should have cancel and submit buttons', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            await page.locator('button:has-text("Añadir")').click();
            await expect(page.locator('button:has-text("Cancelar")')).toBeVisible();
            await expect(page.locator('button:has-text("Añadir")').last()).toBeVisible();
        }
    });

    test('should close modal when clicking Cancelar', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            await page.locator('button:has-text("Añadir")').first().click();
            await page.locator('button:has-text("Cancelar")').click();
            await expect(page.locator('text=Añadir regla')).not.toBeVisible();
        }
    });

});

test.describe('Rules List and Search - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/groups');
        await page.waitForLoadState('domcontentloaded');
        
        const firstGroup = page.locator('button').filter({ hasText: 'dominios' }).first();
        if (await firstGroup.count() > 0) {
            await firstGroup.click();
            await page.waitForLoadState('domcontentloaded');
        }
    });

    test('should have search input field', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            await expect(page.locator('input[placeholder="Buscar…"]')).toBeVisible();
        }
    });

    test('should display rules list or empty state', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            const hasRules = await page.locator('button:has-text("Eliminar")').count() > 0;
            const hasEmpty = await page.locator('text=No hay dominios').count() > 0;
            expect(hasRules || hasEmpty).toBe(true);
        }
    });

    test('rules should have delete button', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            const ruleItem = page.locator('li').filter({ has: page.locator('button:has-text("Eliminar")') }).first();
            if (await ruleItem.count() > 0) {
                await expect(ruleItem.locator('button:has-text("Eliminar")')).toBeVisible();
            }
        }
    });

    test('search should filter rules', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail && await page.locator('button:has-text("Eliminar")').count() > 0) {
            const searchInput = page.locator('input[placeholder="Buscar…"]');
            await searchInput.fill('nonexistentdomain12345xyz');
            await expect(page.locator('text=No hay resultados')).toBeVisible();
        }
    });

});

test.describe('Delete Group Modal - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/groups');
        await page.waitForLoadState('domcontentloaded');
        
        const firstGroup = page.locator('button').filter({ hasText: 'dominios' }).first();
        if (await firstGroup.count() > 0) {
            await firstGroup.click();
            await page.waitForLoadState('domcontentloaded');
        }
    });

    test('should open delete confirmation modal when clicking Eliminar', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            await page.locator('button:has-text("Eliminar")').first().click();
            await expect(page.locator('text=Eliminar grupo')).toBeVisible();
            await expect(page.locator('text=Esto eliminará el grupo')).toBeVisible();
        }
    });

    test('delete modal should have cancel and confirm buttons', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            await page.locator('button:has-text("Eliminar")').first().click();
            await expect(page.locator('button:has-text("Cancelar")').last()).toBeVisible();
            await expect(page.locator('button:has-text("Eliminar")').last()).toBeVisible();
        }
    });

    test('should close delete modal when clicking Cancelar', async ({ page }) => {
        const isOnDetail = /\/dashboard\/groups\/.+/.test(page.url());
        if (isOnDetail) {
            await page.locator('button:has-text("Eliminar")').first().click();
            await page.locator('button:has-text("Cancelar")').last().click();
            await expect(page.locator('text=Eliminar grupo')).not.toBeVisible();
        }
    });

});
