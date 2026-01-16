import { test, expect } from '@playwright/test';

/**
 * Admin Users Management E2E Tests
 * 
 * Covers UAT Scripts: 01_admin_tic.md Section 2 (Tests 2.1-2.6)
 * 
 * Tests the user management functionality including:
 * - Navigation to users section
 * - Creating new users (teacher, student)
 * - Assigning groups to teachers
 * - Changing user roles
 * - Viewing user details
 */

test.describe('Users Section - DOM Structure', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('users section should exist in DOM', { tag: '@smoke' }, async ({ page }) => {
        const usersSection = page.locator('#users-section');
        await expect(usersSection).toBeAttached();
    });

    test('users section should have header with title', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.1
        const sectionHeader = page.locator('#users-section .section-header h2');
        await expect(sectionHeader).toBeAttached();
        await expect(sectionHeader).toContainText('Usuarios');
    });

    test('new user button should exist', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.1
        const newUserBtn = page.locator('#new-user-btn');
        await expect(newUserBtn).toBeAttached();
    });

    test('users list container should exist', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.1
        const usersList = page.locator('#users-list');
        await expect(usersList).toBeAttached();
    });

    test('admin users button should exist in header', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 1.5 & 2.1
        const adminUsersBtn = page.locator('#admin-users-btn');
        await expect(adminUsersBtn).toBeAttached();
    });

});

test.describe('New User Modal - Structure', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('new user modal should exist in DOM', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.2
        const modal = page.locator('#modal-new-user');
        await expect(modal).toBeAttached();
    });

    test('new user modal should have email field', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.2
        const emailField = page.locator('#new-user-email');
        await expect(emailField).toBeAttached();
        await expect(emailField).toHaveAttribute('type', 'email');
        await expect(emailField).toHaveAttribute('required', '');
    });

    test('new user modal should have name field', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.2
        const nameField = page.locator('#new-user-name');
        await expect(nameField).toBeAttached();
        await expect(nameField).toHaveAttribute('required', '');
    });

    test('new user modal should have password field with minimum length', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.2
        const passwordField = page.locator('#new-user-password');
        await expect(passwordField).toBeAttached();
        await expect(passwordField).toHaveAttribute('type', 'password');
        await expect(passwordField).toHaveAttribute('minlength', '8');
    });

    test('new user modal should have role selector', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.2
        const roleSelect = page.locator('#new-user-role');
        await expect(roleSelect).toBeAttached();
        
        // Check role options exist
        const teacherOption = roleSelect.locator('option[value="teacher"]');
        const adminOption = roleSelect.locator('option[value="admin"]');
        await expect(teacherOption).toBeAttached();
        await expect(adminOption).toBeAttached();
    });

    test('new user modal should have groups container for teachers', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.3
        const groupsContainer = page.locator('#new-user-groups-container');
        await expect(groupsContainer).toBeAttached();
        
        const groupsList = page.locator('#new-user-groups');
        await expect(groupsList).toBeAttached();
    });

    test('new user form should have submit button', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.2
        const form = page.locator('#new-user-form');
        await expect(form).toBeAttached();
        
        const submitBtn = form.locator('button[type="submit"]');
        await expect(submitBtn).toBeAttached();
        await expect(submitBtn).toContainText('Crear usuario');
    });

    test('new user modal should have close button', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.2
        const closeBtn = page.locator('#modal-new-user .modal-close');
        await expect(closeBtn).toBeAttached();
    });

    test('new user modal should have cancel button', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.2
        const cancelBtn = page.locator('#modal-new-user .modal-cancel');
        await expect(cancelBtn).toBeAttached();
    });

});

test.describe('Assign Role Modal - Structure', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('assign role modal should exist in DOM', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.3 & 2.4
        const modal = page.locator('#modal-assign-role');
        await expect(modal).toBeAttached();
    });

    test('assign role modal should have role selector with all options', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.4
        const roleSelect = page.locator('#assign-role-type');
        await expect(roleSelect).toBeAttached();
        
        // Check all role options exist
        const teacherOption = roleSelect.locator('option[value="teacher"]');
        const adminOption = roleSelect.locator('option[value="admin"]');
        const studentOption = roleSelect.locator('option[value="student"]');
        
        await expect(teacherOption).toBeAttached();
        await expect(adminOption).toBeAttached();
        await expect(studentOption).toBeAttached();
    });

    test('assign role modal should have groups selection for teachers', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.3
        const groupsContainer = page.locator('#assign-role-groups-container');
        await expect(groupsContainer).toBeAttached();
        
        const groupsList = page.locator('#assign-role-groups');
        await expect(groupsList).toBeAttached();
    });

    test('assign role modal should have user name display', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.5
        const userName = page.locator('#assign-role-user-name');
        await expect(userName).toBeAttached();
    });

    test('assign role modal should have hidden user ID field', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.4
        const userId = page.locator('#assign-role-user-id');
        await expect(userId).toBeAttached();
        await expect(userId).toHaveAttribute('type', 'hidden');
    });

    test('assign role form should have submit button', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.4
        const form = page.locator('#assign-role-form');
        await expect(form).toBeAttached();
        
        const submitBtn = form.locator('button[type="submit"]');
        await expect(submitBtn).toBeAttached();
        await expect(submitBtn).toContainText('Asignar rol');
    });

});

test.describe('User Role Labels', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('teacher role option should have correct label', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.2
        const teacherOption = page.locator('#new-user-role option[value="teacher"]');
        await expect(teacherOption).toContainText('Profesor');
    });

    test('admin role option should have correct label', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.2
        const adminOption = page.locator('#new-user-role option[value="admin"]');
        await expect(adminOption).toContainText('Administrador');
    });

    test('student role option should exist in assign role modal', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.6
        const studentOption = page.locator('#assign-role-type option[value="student"]');
        await expect(studentOption).toContainText('Estudiante');
    });

});

test.describe('Form Validation - New User', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('email field should require valid email format', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.2
        const emailField = page.locator('#new-user-email');
        await expect(emailField).toHaveAttribute('type', 'email');
    });

    test('password field should require minimum 8 characters', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.2
        const passwordField = page.locator('#new-user-password');
        await expect(passwordField).toHaveAttribute('minlength', '8');
    });

    test('name field should be required', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.2
        const nameField = page.locator('#new-user-name');
        await expect(nameField).toHaveAttribute('required', '');
    });

    test('email field should be required', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 2.2
        const emailField = page.locator('#new-user-email');
        await expect(emailField).toHaveAttribute('required', '');
    });

});

test.describe('Accessibility - Users Section', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('new user form fields should have labels', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 10.2
        const emailLabel = page.locator('label[for="new-user-email"]');
        const nameLabel = page.locator('label[for="new-user-name"]');
        const passwordLabel = page.locator('label[for="new-user-password"]');
        const roleLabel = page.locator('label[for="new-user-role"]');
        
        await expect(emailLabel).toBeAttached();
        await expect(nameLabel).toBeAttached();
        await expect(passwordLabel).toBeAttached();
        await expect(roleLabel).toBeAttached();
    });

    test('assign role form fields should have labels', async ({ page }) => {
        // UAT: 01_admin_tic.md Test 10.2
        const roleLabel = page.locator('label[for="assign-role-type"]');
        await expect(roleLabel).toBeAttached();
    });

});
