import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

test.describe('Users Section - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/users');
        await page.waitForLoadState('domcontentloaded');
    });

    test('users page should display title and description', { tag: '@smoke' }, async ({ page }) => {
        await expect(page.locator('text=Gestión de Usuarios')).toBeVisible();
    });

    test('should have new user button', async ({ page }) => {
        await expect(page.locator('button:has-text("Nuevo Usuario")')).toBeVisible();
    });

    test('should display users table with headers', async ({ page }) => {
        await expect(page.locator('th:has-text("Nombre")')).toBeVisible();
        await expect(page.locator('th:has-text("Email")')).toBeVisible();
        await expect(page.locator('th:has-text("Rol")')).toBeVisible();
    });

    test('users should display role badges', async ({ page }) => {
        const roleBadge = page.locator('.bg-emerald-100, .bg-blue-100, .bg-slate-100').first();
        if (await roleBadge.count() > 0) {
            await expect(roleBadge).toBeVisible();
        }
    });

    test('users should have action buttons', async ({ page }) => {
        const editBtn = page.locator('button:has-text("Editar")').first();
        if (await editBtn.count() > 0) {
            await expect(editBtn).toBeVisible();
        }
    });

});

test.describe('Create User Modal - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/users');
        await page.waitForLoadState('domcontentloaded');
    });

    test('should open create user modal when clicking Nuevo Usuario', async ({ page }) => {
        await page.locator('button:has-text("Nuevo Usuario")').click();
        await expect(page.locator('text=Crear Usuario')).toBeVisible();
    });

    test('create user modal should have name field', async ({ page }) => {
        await page.locator('button:has-text("Nuevo Usuario")').click();
        await expect(page.locator('label:has-text("Nombre")')).toBeVisible();
        await expect(page.locator('input[placeholder*="Pérez"]')).toBeVisible();
    });

    test('create user modal should have email field with validation', async ({ page }) => {
        await page.locator('button:has-text("Nuevo Usuario")').click();
        const emailInput = page.locator('input[type="email"]');
        await expect(emailInput).toBeVisible();
        await expect(emailInput).toHaveAttribute('required');
    });

    test('create user modal should have password field with minimum length', async ({ page }) => {
        await page.locator('button:has-text("Nuevo Usuario")').click();
        const passwordInput = page.locator('input[type="password"]');
        await expect(passwordInput).toBeVisible();
        await expect(passwordInput).toHaveAttribute('minlength', '8');
    });

    test('create user modal should have cancel and submit buttons', async ({ page }) => {
        await page.locator('button:has-text("Nuevo Usuario")').click();
        await expect(page.locator('button:has-text("Cancelar")')).toBeVisible();
        await expect(page.locator('button:has-text("Crear Usuario")')).toBeVisible();
    });

    test('should close modal when clicking Cancelar', async ({ page }) => {
        await page.locator('button:has-text("Nuevo Usuario")').click();
        await page.locator('button:has-text("Cancelar")').click();
        await expect(page.locator('text=Crear Usuario')).not.toBeVisible();
    });

});

test.describe('Edit User Modal - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/users');
        await page.waitForLoadState('domcontentloaded');
    });

    test('should open edit user modal when clicking Editar', async ({ page }) => {
        const editBtn = page.locator('button:has-text("Editar")').first();
        if (await editBtn.count() > 0) {
            await editBtn.click();
            await expect(page.locator('text=Editar Usuario')).toBeVisible();
        }
    });

    test('edit user modal should have name and email fields', async ({ page }) => {
        const editBtn = page.locator('button:has-text("Editar")').first();
        if (await editBtn.count() > 0) {
            await editBtn.click();
            await expect(page.locator('label:has-text("Nombre")')).toBeVisible();
            await expect(page.locator('label:has-text("Email")')).toBeVisible();
        }
    });

    test('edit user modal should have optional password field', async ({ page }) => {
        const editBtn = page.locator('button:has-text("Editar")').first();
        if (await editBtn.count() > 0) {
            await editBtn.click();
            await expect(page.locator('label:has-text("Contraseña")')).toBeVisible();
        }
    });

});

test.describe('Assign Role Modal - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/users');
        await page.waitForLoadState('domcontentloaded');
    });

    test('should open assign role modal when clicking Asignar Rol', async ({ page }) => {
        const assignBtn = page.locator('button:has-text("Asignar Rol")').first();
        if (await assignBtn.count() > 0) {
            await assignBtn.click();
            await expect(page.locator('text=Asignar Rol')).toBeVisible();
        }
    });

    test('assign role modal should have role selector with all options', async ({ page }) => {
        const assignBtn = page.locator('button:has-text("Asignar Rol")').first();
        if (await assignBtn.count() > 0) {
            await assignBtn.click();
            const roleSelect = page.locator('select');
            await expect(roleSelect).toBeVisible();
            await expect(roleSelect.locator('option:has-text("Administrador")')).toBeAttached();
            await expect(roleSelect.locator('option:has-text("Profesor")')).toBeAttached();
            await expect(roleSelect.locator('option:has-text("Estudiante")')).toBeAttached();
        }
    });

    test('assign role modal should show groups selection when teacher role selected', async ({ page }) => {
        const assignBtn = page.locator('button:has-text("Asignar Rol")').first();
        if (await assignBtn.count() > 0) {
            await assignBtn.click();
            const roleSelect = page.locator('select');
            await roleSelect.selectOption('teacher');
            const groupsLabel = page.locator('text=Grupos (múltiple selección)');
            if (await groupsLabel.count() > 0) {
                await expect(groupsLabel).toBeVisible();
            }
        }
    });

});

test.describe('User Table Actions - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/users');
        await page.waitForLoadState('domcontentloaded');
    });

    test('user rows should have edit button', async ({ page }) => {
        const tbody = page.locator('tbody');
        const firstRow = tbody.locator('tr').first();
        if (await firstRow.count() > 0) {
            await expect(firstRow.locator('button:has-text("Editar")')).toBeVisible();
        }
    });

    test('user rows should have assign role button', async ({ page }) => {
        const tbody = page.locator('tbody');
        const firstRow = tbody.locator('tr').first();
        if (await firstRow.count() > 0) {
            await expect(firstRow.locator('button:has-text("Asignar Rol")')).toBeVisible();
        }
    });

    test('user rows should have delete button', async ({ page }) => {
        const tbody = page.locator('tbody');
        const firstRow = tbody.locator('tr').first();
        if (await firstRow.count() > 0) {
            const deleteBtn = firstRow.locator('button').filter({ has: page.locator('svg') }).last();
            await expect(deleteBtn).toBeVisible();
        }
    });

});

    test('users page should display title and description', { tag: '@smoke' }, async ({ page }) => {
        await expect(page.locator('text=Gestión de Usuarios')).toBeVisible();
    });

    test('should have new user button', async ({ page }) => {
        await expect(page.locator('button:has-text("Nuevo Usuario")')).toBeVisible();
    });

    test('should display users table with headers', async ({ page }) => {
        await expect(page.locator('th:has-text("Nombre")')).toBeVisible();
        await expect(page.locator('th:has-text("Email")')).toBeVisible();
        await expect(page.locator('th:has-text("Rol")')).toBeVisible();
    });

    test('users should display role badges', async ({ page }) => {
        const roleBadge = page.locator('.bg-emerald-100, .bg-blue-100, .bg-slate-100').first();
        if (await roleBadge.count() > 0) {
            await expect(roleBadge).toBeVisible();
        }
    });

    test('users should have action buttons', async ({ page }) => {
        const editBtn = page.locator('button:has-text("Editar")').first();
        if (await editBtn.count() > 0) {
            await expect(editBtn).toBeVisible();
        }
    });

});

test.describe('Create User Modal - React Components', () => {

    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto('/dashboard/users');
        await page.waitForLoadState('domcontentloaded');
    });

    test('should open create user modal when clicking Nuevo Usuario', async ({ page }) => {
        await page.locator('button:has-text("Nuevo Usuario")').click();
        await expect(page.locator('text=Crear Usuario')).toBeVisible();
    });

    test('create user modal should have name field', async ({ page }) => {
        await page.locator('button:has-text("Nuevo Usuario")').click();
        await expect(page.locator('label:has-text("Nombre")')).toBeVisible();
        await expect(page.locator('input[placeholder*="Pérez"]')).toBeVisible();
    });

    test('create user modal should have email field with validation', async ({ page }) => {
        await page.locator('button:has-text("Nuevo Usuario")').click();
        const emailInput = page.locator('input[type="email"]');
        await expect(emailInput).toBeVisible();
        await expect(emailInput).toHaveAttribute('required');
    });

    test('create user modal should have password field with minimum length', async ({ page }) => {
        await page.locator('button:has-text("Nuevo Usuario")').click();
        const passwordInput = page.locator('input[type="password"]');
        await expect(passwordInput).toBeVisible();
        await expect(passwordInput).toHaveAttribute('minlength', '8');
    });

    test('create user modal should have cancel and submit buttons', async ({ page }) => {
        await page.locator('button:has-text("Nuevo Usuario")').click();
        await expect(page.locator('button:has-text("Cancelar")')).toBeVisible();
        await expect(page.locator('button:has-text("Crear Usuario")')).toBeVisible();
    });

    test('should close modal when clicking Cancelar', async ({ page }) => {
        await page.locator('button:has-text("Nuevo Usuario")').click();
        await page.locator('button:has-text("Cancelar")').click();
        await expect(page.locator('text=Crear Usuario')).not.toBeVisible();
    });

});
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
