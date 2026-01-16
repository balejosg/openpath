import { test, expect } from '@playwright/test';

// UAT Script: 01_admin_tic.md Section 5 (Tests 5.1-5.5)

test.describe('Groups/Domains Section - DOM Structure', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('groups section should exist in DOM', { tag: '@smoke' }, async ({ page }) => {
        const groupsSection = page.locator('.groups-section');
        await expect(groupsSection).toBeAttached();
    });

    test('groups section should have header with title', async ({ page }) => {
        const sectionHeader = page.locator('.groups-section .section-header h2');
        await expect(sectionHeader).toBeAttached();
        await expect(sectionHeader).toContainText('Grupos');
    });

    test('new group button should exist', async ({ page }) => {
        const newGroupBtn = page.locator('#new-group-btn');
        await expect(newGroupBtn).toBeAttached();
        await expect(newGroupBtn).toContainText('Nuevo grupo');
    });

    test('groups list container should exist', async ({ page }) => {
        const groupsList = page.locator('#groups-list');
        await expect(groupsList).toBeAttached();
    });

});

test.describe('New Group Modal - Structure', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('new group modal should exist in DOM', async ({ page }) => {
        const modal = page.locator('#modal-new-group');
        await expect(modal).toBeAttached();
    });

    test('new group modal should have name field', async ({ page }) => {
        const nameField = page.locator('#new-group-name');
        await expect(nameField).toBeAttached();
        await expect(nameField).toHaveAttribute('required', '');
    });

    test('new group name field should have pattern validation', async ({ page }) => {
        const nameField = page.locator('#new-group-name');
        const pattern = await nameField.getAttribute('pattern');
        expect(pattern).toBeTruthy();
    });

    test('new group form should have submit button', async ({ page }) => {
        const form = page.locator('#new-group-form');
        await expect(form).toBeAttached();
        
        const submitBtn = form.locator('button[type="submit"]');
        await expect(submitBtn).toBeAttached();
        await expect(submitBtn).toContainText('Crear grupo');
    });

    test('new group modal should have close button', async ({ page }) => {
        const closeBtn = page.locator('#modal-new-group .modal-close');
        await expect(closeBtn).toBeAttached();
    });

    test('new group modal should have cancel button', async ({ page }) => {
        const cancelBtn = page.locator('#modal-new-group .modal-cancel');
        await expect(cancelBtn).toBeAttached();
    });

    test('new group name field should have placeholder', async ({ page }) => {
        const nameField = page.locator('#new-group-name');
        const placeholder = await nameField.getAttribute('placeholder');
        expect(placeholder).toContain('informatica');
    });

    test('new group modal should have help text', async ({ page }) => {
        const helpText = page.locator('#modal-new-group small');
        await expect(helpText).toBeAttached();
    });

});

test.describe('Add Rule Modal - Structure', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('add rule modal should exist in DOM', async ({ page }) => {
        const modal = page.locator('#modal-add-rule');
        await expect(modal).toBeAttached();
    });

    test('add rule modal should have value field', async ({ page }) => {
        const valueField = page.locator('#new-rule-value');
        await expect(valueField).toBeAttached();
        await expect(valueField).toHaveAttribute('required', '');
    });

    test('add rule form should have submit button', async ({ page }) => {
        const form = page.locator('#add-rule-form');
        await expect(form).toBeAttached();
        
        const submitBtn = form.locator('button[type="submit"]');
        await expect(submitBtn).toBeAttached();
    });

});

test.describe('Bulk Add Modal - Structure', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('bulk add modal should exist in DOM', async ({ page }) => {
        const modal = page.locator('#modal-bulk-add');
        await expect(modal).toBeAttached();
    });

    test('bulk add modal should have textarea', async ({ page }) => {
        const textarea = page.locator('#bulk-values');
        await expect(textarea).toBeAttached();
    });

    test('bulk add form should have submit button', async ({ page }) => {
        const form = page.locator('#bulk-add-form');
        await expect(form).toBeAttached();
        
        const submitBtn = form.locator('button[type="submit"]');
        await expect(submitBtn).toBeAttached();
        await expect(submitBtn).toContainText('Añadir todas');
    });

});

test.describe('Editor Screen - Rules Management', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('editor screen should exist in DOM', async ({ page }) => {
        const editorScreen = page.locator('#editor-screen');
        await expect(editorScreen).toBeAttached();
    });

    test('editor should have back button', async ({ page }) => {
        const backBtn = page.locator('#back-btn');
        await expect(backBtn).toBeAttached();
    });

    test('editor should have copy URL button', async ({ page }) => {
        const copyBtn = page.locator('#copy-url-btn');
        await expect(copyBtn).toBeAttached();
    });

    test('editor should have group name display', async ({ page }) => {
        const groupName = page.locator('#group-name-display');
        await expect(groupName).toBeAttached();
    });

    test('editor should have enabled/disabled selector', async ({ page }) => {
        const enabledSelect = page.locator('#group-enabled');
        await expect(enabledSelect).toBeAttached();
    });

    test('editor should have save config button', async ({ page }) => {
        const saveBtn = page.locator('#save-config-btn');
        await expect(saveBtn).toBeAttached();
    });

    test('editor should have delete group button', async ({ page }) => {
        const deleteBtn = page.locator('#delete-group-btn');
        await expect(deleteBtn).toBeAttached();
    });

    test('editor should have export URL display', async ({ page }) => {
        const exportUrl = page.locator('#export-url');
        await expect(exportUrl).toBeAttached();
    });

});

test.describe('Rules Tabs', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('whitelist tab should exist', async ({ page }) => {
        const whitelistTab = page.locator('.tab[data-type="whitelist"]');
        await expect(whitelistTab).toBeAttached();
    });

    test('blocked subdomains tab should exist', async ({ page }) => {
        const blockedSubdomainsTab = page.locator('.tab[data-type="blockedSubdomains"]');
        await expect(blockedSubdomainsTab).toBeAttached();
    });

    test('blocked paths tab should exist', async ({ page }) => {
        const blockedPathsTab = page.locator('.tab[data-type="blockedPaths"]');
        await expect(blockedPathsTab).toBeAttached();
    });

    test('whitelist tab should have count badge', async ({ page }) => {
        const countBadge = page.locator('#count-whitelist');
        await expect(countBadge).toBeAttached();
    });

    test('blocked subdomains tab should have count badge', async ({ page }) => {
        const countBadge = page.locator('#count-blockedSubdomains');
        await expect(countBadge).toBeAttached();
    });

    test('blocked paths tab should have count badge', async ({ page }) => {
        const countBadge = page.locator('#count-blockedPaths');
        await expect(countBadge).toBeAttached();
    });

});

test.describe('Rules Toolbar', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('search input should exist', async ({ page }) => {
        const searchInput = page.locator('#search-rules');
        await expect(searchInput).toBeAttached();
    });

    test('add rule button should exist', async ({ page }) => {
        const addRuleBtn = page.locator('#add-rule-btn');
        await expect(addRuleBtn).toBeAttached();
    });

    test('bulk add button should exist', async ({ page }) => {
        const bulkAddBtn = page.locator('#bulk-add-btn');
        await expect(bulkAddBtn).toBeAttached();
    });

    test('rules list container should exist', async ({ page }) => {
        const rulesList = page.locator('#rules-list');
        await expect(rulesList).toBeAttached();
    });

});
