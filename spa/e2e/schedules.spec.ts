import { test, expect } from '@playwright/test';

// UAT Script: 01_admin_tic.md Section 7 (Tests 7.1-7.6)

test.describe('Schedule Section - DOM Structure', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('schedule section should exist in DOM', async ({ page }) => {
        const scheduleSection = page.locator('#schedule-section');
        await expect(scheduleSection).toBeAttached();
    });

    test('schedule section should have header with title', async ({ page }) => {
        const sectionHeader = page.locator('#schedule-section .section-header h2');
        await expect(sectionHeader).toBeAttached();
        await expect(sectionHeader).toContainText('Horario');
    });

    test('schedule classroom selector should exist', async ({ page }) => {
        const classroomSelect = page.locator('#schedule-classroom-select');
        await expect(classroomSelect).toBeAttached();
    });

    test('schedule refresh button should exist', async ({ page }) => {
        const refreshBtn = page.locator('#schedule-refresh-btn');
        await expect(refreshBtn).toBeAttached();
    });

    test('schedule grid container should exist', async ({ page }) => {
        const gridContainer = page.locator('#schedule-grid-container');
        await expect(gridContainer).toBeAttached();
    });

});

test.describe('Schedule - Classroom Selector', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('classroom selector should have empty default option', async ({ page }) => {
        const emptyOption = page.locator('#schedule-classroom-select option[value=""]');
        await expect(emptyOption).toBeAttached();
    });

    test('classroom selector default option should have placeholder text', async ({ page }) => {
        const emptyOption = page.locator('#schedule-classroom-select option[value=""]');
        const text = await emptyOption.textContent();
        expect(text?.toLowerCase()).toContain('seleccionar');
    });

    test('classroom selector should be a form control', async ({ page }) => {
        const classroomSelect = page.locator('#schedule-classroom-select');
        const classNames = await classroomSelect.getAttribute('class');
        expect(classNames).toContain('form-control');
    });

});

test.describe('Schedule - Empty State', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('schedule grid should have empty message', async ({ page }) => {
        const emptyMessage = page.locator('#schedule-grid-container .empty-message');
        await expect(emptyMessage).toBeAttached();
    });

    test('empty message should prompt classroom selection', async ({ page }) => {
        const emptyMessage = page.locator('#schedule-grid-container .empty-message');
        const text = await emptyMessage.textContent();
        expect(text?.toLowerCase()).toContain('selecciona');
    });

});

test.describe('Schedule - Header Actions', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('schedule actions container should exist', async ({ page }) => {
        const actionsContainer = page.locator('#schedule-section .schedule-actions');
        await expect(actionsContainer).toBeAttached();
    });

    test('schedule section header should exist', async ({ page }) => {
        const sectionHeader = page.locator('#schedule-section .section-header');
        await expect(sectionHeader).toBeAttached();
    });

});

test.describe('Responsive - Schedule Section', () => {

    test('schedule section should be in DOM on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const scheduleSection = page.locator('#schedule-section');
        await expect(scheduleSection).toBeAttached();
    });

    test('classroom selector should be in DOM on tablet', async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const classroomSelect = page.locator('#schedule-classroom-select');
        await expect(classroomSelect).toBeAttached();
    });

    test('schedule grid container should be in DOM on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const gridContainer = page.locator('#schedule-grid-container');
        await expect(gridContainer).toBeAttached();
    });

});
