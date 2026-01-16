import { test, expect } from '@playwright/test';

// UAT Script: 01_admin_tic.md Section 4 (Tests 4.1-4.8)

test.describe('Classrooms Section - DOM Structure', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('classrooms section should exist in DOM', { tag: '@smoke' }, async ({ page }) => {
        const classroomsSection = page.locator('#classrooms-section');
        await expect(classroomsSection).toBeAttached();
    });

    test('classrooms section should have header with title', async ({ page }) => {
        const sectionHeader = page.locator('#classrooms-section .section-header h2');
        await expect(sectionHeader).toBeAttached();
        await expect(sectionHeader).toContainText('Aulas');
    });

    test('new classroom button should exist', async ({ page }) => {
        const newClassroomBtn = page.locator('#new-classroom-btn');
        await expect(newClassroomBtn).toBeAttached();
        await expect(newClassroomBtn).toContainText('Nueva aula');
    });

    test('classrooms list container should exist', async ({ page }) => {
        const classroomsList = page.locator('#classrooms-list');
        await expect(classroomsList).toBeAttached();
    });

    test('classrooms section should be admin-only', async ({ page }) => {
        const classroomsSection = page.locator('#classrooms-section');
        const classNames = await classroomsSection.getAttribute('class');
        expect(classNames).toContain('admin-only');
    });

});

test.describe('New Classroom Modal - Structure', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('new classroom modal should exist in DOM', async ({ page }) => {
        const modal = page.locator('#modal-new-classroom');
        await expect(modal).toBeAttached();
    });

    test('new classroom modal should have name field', async ({ page }) => {
        const nameField = page.locator('#new-classroom-name');
        await expect(nameField).toBeAttached();
        await expect(nameField).toHaveAttribute('required', '');
    });

    test('new classroom modal should have default group selector', async ({ page }) => {
        const groupSelect = page.locator('#new-classroom-default-group');
        await expect(groupSelect).toBeAttached();
    });

    test('new classroom form should have submit button', async ({ page }) => {
        const form = page.locator('#new-classroom-form');
        await expect(form).toBeAttached();
        
        const submitBtn = form.locator('button[type="submit"]');
        await expect(submitBtn).toBeAttached();
        await expect(submitBtn).toContainText('Crear aula');
    });

    test('new classroom modal should have close button', async ({ page }) => {
        const closeBtn = page.locator('#modal-new-classroom .modal-close');
        await expect(closeBtn).toBeAttached();
    });

    test('new classroom modal should have cancel button', async ({ page }) => {
        const cancelBtn = page.locator('#modal-new-classroom .modal-cancel');
        await expect(cancelBtn).toBeAttached();
    });

    test('new classroom name field should have placeholder', async ({ page }) => {
        const nameField = page.locator('#new-classroom-name');
        const placeholder = await nameField.getAttribute('placeholder');
        expect(placeholder).toBeTruthy();
    });

    test('default group selector should have empty option', async ({ page }) => {
        const emptyOption = page.locator('#new-classroom-default-group option[value=""]');
        await expect(emptyOption).toBeAttached();
    });

});

test.describe('Classrooms - Form Labels', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('classroom name field should have label', async ({ page }) => {
        const label = page.locator('label[for="new-classroom-name"]');
        await expect(label).toBeAttached();
        await expect(label).toContainText('Nombre');
    });

    test('default group field should have label', async ({ page }) => {
        const label = page.locator('label[for="new-classroom-default-group"]');
        await expect(label).toBeAttached();
        await expect(label).toContainText('Grupo');
    });

    test('default group field should have help text', async ({ page }) => {
        const helpText = page.locator('#modal-new-classroom small');
        await expect(helpText.first()).toBeAttached();
    });

});

test.describe('Schedule Section - Related to Classrooms', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('schedule section should exist in DOM', async ({ page }) => {
        const scheduleSection = page.locator('#schedule-section');
        await expect(scheduleSection).toBeAttached();
    });

    test('schedule section should have classroom selector', async ({ page }) => {
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

test.describe('Responsive - Classrooms Section', () => {

    test('classrooms section should be in DOM on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const classroomsSection = page.locator('#classrooms-section');
        await expect(classroomsSection).toBeAttached();
    });

    test('new classroom button should be in DOM on tablet', async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const newBtn = page.locator('#new-classroom-btn');
        await expect(newBtn).toBeAttached();
    });

});

test.describe('Classroom Creation E2E Flow', () => {
    const ADMIN_EMAIL = 'maria.admin@test.com';
    const ADMIN_PASSWORD = 'AdminPassword123!';
    const CLASSROOM_NAME = `E2E Test Aula ${String(Date.now())}`;

    test('should create classroom and verify it appears in listings', { tag: '@smoke' }, async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        await page.locator('#login-email').waitFor({ state: 'visible', timeout: 10000 });
        await page.fill('#login-email', ADMIN_EMAIL);
        await page.fill('#login-password', ADMIN_PASSWORD);
        await page.click('#email-login-btn');

        await page.waitForSelector('#dashboard-screen', { state: 'visible', timeout: 10000 });

        const newClassroomBtn = page.locator('#new-classroom-btn');
        await newClassroomBtn.waitFor({ state: 'visible', timeout: 5000 });
        await newClassroomBtn.click();

        const modal = page.locator('#modal-new-classroom');
        await modal.waitFor({ state: 'visible', timeout: 5000 });

        await page.fill('#new-classroom-name', CLASSROOM_NAME);

        const groupSelect = page.locator('#new-classroom-default-group');
        const firstOption = groupSelect.locator('option:not([value=""])').first();
        const firstOptionValue = await firstOption.getAttribute('value');
        if (firstOptionValue) {
            await groupSelect.selectOption(firstOptionValue);
        }

        const submitBtn = page.locator('#new-classroom-form button[type="submit"]');
        await submitBtn.click();

        await modal.waitFor({ state: 'hidden', timeout: 10000 });

        await page.waitForTimeout(1000);

        const classroomsList = page.locator('#classrooms-list');
        await expect(classroomsList).toContainText(CLASSROOM_NAME, { timeout: 10000 });

        const scheduleClassroomSelect = page.locator('#schedule-classroom-select');
        await expect(scheduleClassroomSelect).toContainText(CLASSROOM_NAME, { timeout: 5000 });
    });
});
