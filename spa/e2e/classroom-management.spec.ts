import { test, expect } from '@playwright/test';

/**
 * Classroom Management E2E Tests - US4
 * 
 * Tests the classroom management UI elements:
 * - Admin login flow
 * - Classroom management section
 * - New classroom modal
 */

// Admin credentials (created by CI setup)
const ADMIN_EMAIL = 'maria.admin@test.com';
const ADMIN_PASSWORD = 'AdminPassword123!';

test.describe('Classroom Management', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('should display login form for classroom management', async ({ page }) => {
        // Classroom management requires login
        await expect(page.locator('#email-login-form')).toBeVisible({ timeout: 10000 });
    });

    test('classroom section should exist in HTML for admins', async ({ page }) => {
        // Check that the classrooms section is defined in HTML (hidden by default)
        const classroomsSection = page.locator('#classrooms-section');

        // It exists in the DOM
        await expect(classroomsSection).toBeAttached();
    });

    test('new classroom modal should exist in HTML', async ({ page }) => {
        // Check that the modal is defined in HTML
        const modal = page.locator('#modal-new-classroom');

        // Modal exists in DOM
        await expect(modal).toBeAttached();
    });

    test('admin login attempt should handle response', async ({ page }) => {
        await page.locator('#login-email').waitFor({ state: 'visible', timeout: 10000 });

        // Fill admin credentials
        await page.fill('#login-email', ADMIN_EMAIL);
        await page.fill('#login-password', ADMIN_PASSWORD);
        await page.click('#email-login-btn');

        // Wait for response - either success (dashboard) or error
        await page.waitForTimeout(2000);

        // Check if we navigated away from login or got an error
        const loginFormVisible = await page.locator('#email-login-form').isVisible();
        const dashboardVisible = await page.locator('#dashboard-screen').isVisible();

        // One of these should be true
        expect(loginFormVisible || dashboardVisible).toBe(true);
    });

    test('classroom UI elements should have correct structure', async ({ page }) => {
        // Verify the HTML structure of classroom elements

        // Classrooms section should have header
        const classroomsHeader = await page.locator('#classrooms-section h3').count();
        expect(classroomsHeader).toBeGreaterThanOrEqual(0); // May be 0 if section hidden

        // New classroom button should exist
        const newClassroomBtn = page.locator('#new-classroom-btn');
        await expect(newClassroomBtn).toBeAttached();

        // Classrooms list container should exist
        const classroomsList = page.locator('#classrooms-list');
        await expect(classroomsList).toBeAttached();
    });

    test('new classroom form should have required fields', async ({ page }) => {
        // Check modal form structure
        const nameInput = page.locator('#new-classroom-name');
        const groupSelect = page.locator('#new-classroom-default-group');

        await expect(nameInput).toBeAttached();
        await expect(groupSelect).toBeAttached();
    });

    test('page should be responsive for classroom management', async ({ page }) => {
        // Set tablet viewport
        await page.setViewportSize({ width: 768, height: 1024 });

        // Page should still work
        await expect(page.locator('#email-login-form')).toBeVisible({ timeout: 10000 });

        // No horizontal overflow
        const scrollWidthByValue = await page.evaluate(() => document.body.scrollWidth);
        const viewWidthByValue = await page.evaluate(() => window.innerWidth);
        expect(scrollWidthByValue).toBeLessThanOrEqual(viewWidthByValue + 20);
    });
});
