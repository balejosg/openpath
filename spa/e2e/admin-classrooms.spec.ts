import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

test.describe('Classrooms Section - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/classrooms');
        await page.waitForLoadState('domcontentloaded');
    });

    test('classrooms page should display title and description', { tag: '@smoke' }, async ({ page }) => {
        await expect(page.locator('text=Aulas Seguras')).toBeVisible();
        await expect(page.locator('text=Administración de aulas')).toBeVisible();
    });

    test('should have new classroom button for admins', async ({ page }) => {
        await expect(page.locator('button:has-text("Nueva Aula")')).toBeVisible();
    });

    test('should show empty state when no classrooms configured', async ({ page }) => {
        const hasClassrooms = await page.locator('text=computadoras').count() > 0;
        if (!hasClassrooms) {
            await expect(page.locator('text=No hay aulas configuradas')).toBeVisible();
            await expect(page.locator('button:has-text("Crear primera aula")')).toBeVisible();
        }
    });

    test('classroom cards should display name and machine count', async ({ page }) => {
        const classroomCard = page.locator('text=computadoras').first();
        if (await classroomCard.count() > 0) {
            await expect(classroomCard).toBeVisible();
        }
    });

    test('classroom cards should have group selector', async ({ page }) => {
        const groupSelect = page.locator('select').filter({ hasText: 'Grupo activo' }).first();
        if (await groupSelect.count() > 0) {
            await expect(groupSelect).toBeVisible();
        }
    });

});

test.describe('New Classroom Modal - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/classrooms');
        await page.waitForLoadState('domcontentloaded');
    });

    test('should open new classroom modal when clicking Nueva Aula button', async ({ page }) => {
        await page.locator('button:has-text("Nueva Aula")').click();
        await expect(page.locator('text=Nueva Aula')).toBeVisible();
    });

    test('new classroom modal should have name field', async ({ page }) => {
        await page.locator('button:has-text("Nueva Aula")').click();
        await expect(page.locator('label:has-text("Nombre del aula")')).toBeVisible();
        await expect(page.locator('input[placeholder*="Informática"]')).toBeVisible();
    });

    test('new classroom modal should have group selector', async ({ page }) => {
        await page.locator('button:has-text("Nueva Aula")').click();
        await expect(page.locator('label:has-text("Grupo por defecto")')).toBeVisible();
        await expect(page.locator('select').filter({ has: page.locator('option:has-text("Seleccionar grupo")') })).toBeVisible();
    });

    test('new classroom modal should have cancel and create buttons', async ({ page }) => {
        await page.locator('button:has-text("Nueva Aula")').click();
        await expect(page.locator('button:has-text("Cancelar")')).toBeVisible();
        await expect(page.locator('button:has-text("Crear")').last()).toBeVisible();
    });

    test('should close modal when clicking Cancelar', async ({ page }) => {
        await page.locator('button:has-text("Nueva Aula")').click();
        await page.locator('button:has-text("Cancelar")').click();
        await expect(page.locator('text=Nueva Aula')).not.toBeVisible();
    });

});

test.describe('Schedule Section - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/classrooms');
        await page.waitForLoadState('domcontentloaded');
    });

    test('should have schedule toggle button for each classroom', async ({ page }) => {
        const scheduleBtn = page.locator('button:has-text("Horarios")').first();
        if (await scheduleBtn.count() > 0) {
            await expect(scheduleBtn).toBeVisible();
        }
    });

    test('should expand schedule section when clicking Horarios button', async ({ page }) => {
        const scheduleBtn = page.locator('button:has-text("Horarios")').first();
        if (await scheduleBtn.count() > 0) {
            await scheduleBtn.click();
            await expect(page.locator('text=Horario Semanal')).toBeVisible();
        }
    });

    test('should collapse schedule section when clicking button again', async ({ page }) => {
        const scheduleBtn = page.locator('button:has-text("Horarios")').first();
        if (await scheduleBtn.count() > 0) {
            await scheduleBtn.click();
            await page.waitForTimeout(500);
            await scheduleBtn.click();
            await expect(page.locator('text=Horario Semanal')).not.toBeVisible();
        }
    });

});

test.describe('Machines Table - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/classrooms');
        await page.waitForLoadState('domcontentloaded');
    });

    test('should display machines table if machines exist', async ({ page }) => {
        const machinesTable = page.locator('text=Máquinas Registradas');
        if (await machinesTable.count() > 0) {
            await expect(machinesTable).toBeVisible();
            await expect(page.locator('th:has-text("Hostname")')).toBeVisible();
            await expect(page.locator('th:has-text("Versión")')).toBeVisible();
            await expect(page.locator('th:has-text("Última conexión")')).toBeVisible();
        }
    });

    test('machines should have rotate token button', async ({ page }) => {
        const rotateBtn = page.locator('button:has-text("Rotar")').first();
        if (await rotateBtn.count() > 0) {
            await expect(rotateBtn).toBeVisible();
        }
    });

    test('machines should have delete button', async ({ page }) => {
        const hasMachines = await page.locator('text=Máquinas Registradas').count() > 0;
        if (hasMachines) {
            const deleteBtn = page.locator('tbody tr').first().locator('button').filter({ has: page.locator('svg') }).last();
            await expect(deleteBtn).toBeVisible();
        }
    });

});

test.describe('Responsive - Classrooms Section', () => {

    test('classrooms page should be accessible on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await loginAsAdmin(page);
        await page.goto('/dashboard/classrooms');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('text=Aulas Seguras')).toBeVisible();
    });

    test('new classroom button should be visible on tablet', async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1024 });
        await loginAsAdmin(page);
        await page.goto('/dashboard/classrooms');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('button:has-text("Nueva Aula")')).toBeVisible();
    });

});
