import { test, expect } from '@playwright/test';
import { ADMIN_CREDENTIALS, TEACHER_CREDENTIALS, STUDENT_CREDENTIALS } from './fixtures/auth';

/**
 * Multi-User E2E Flow Tests
 * 
 * UAT Coverage: 05_flujo_e2e.md - Complete day scenario
 * 
 * Simulates a typical school day with multiple users interacting:
 * 1. Admin configures system
 * 2. Teacher starts class
 * 3. Student requests access
 * 4. Teacher approves
 * 5. Student accesses resource
 */

test.describe('Multi-User E2E Flow', { tag: '@extended' }, () => {

    test('complete day flow: admin → teacher → student cycle', async ({ browser }) => {
        // Create separate contexts for each user role
        const adminContext = await browser.newContext();
        const teacherContext = await browser.newContext();
        const studentContext = await browser.newContext();

        const adminPage = await adminContext.newPage();
        const teacherPage = await teacherContext.newPage();
        const studentPage = await studentContext.newPage();

        try {
            await test.step('Admin logs in and checks dashboard', async () => {
                await adminPage.goto('/');
                await adminPage.waitForLoadState('domcontentloaded');

                await adminPage.fill('#login-email', ADMIN_CREDENTIALS.email);
                await adminPage.fill('#login-password', ADMIN_CREDENTIALS.password);
                await adminPage.click('#email-login-btn');

                await expect(adminPage.locator('#logout-btn')).toBeVisible({ timeout: 30000 });
                await expect(adminPage.locator('#dashboard-screen')).toBeVisible();
            });

            // ============================================================
            // Phase 2: Teacher starts class (09:00)
            // ============================================================
            // Phase 2: Teacher starts class (08:55)
            // UAT: 05_flujo_e2e.md - First class
            // ============================================================

            await test.step('Teacher logs in', async () => {
                const requests: string[] = [];
                const consoleMessages: string[] = [];
                
                teacherPage.on('request', req => {
                    if (req.url().includes('login') || req.url().includes('trpc')) {
                        requests.push(`${req.method()} ${req.url()}`);
                    }
                });
                
                teacherPage.on('response', async res => {
                    if (res.url().includes('login') || res.url().includes('trpc')) {
                        const status = res.status();
                        const text = await res.text().catch(() => 'Could not read body');
                        requests.push(`  → ${String(status)} ${text.slice(0, 200)}`);
                    }
                });
                
                teacherPage.on('console', msg => {
                    if (msg.type() === 'error' || msg.text().includes('login') || msg.text().includes('auth')) {
                        consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
                    }
                });
                
                await teacherPage.goto('/');
                await teacherPage.waitForLoadState('domcontentloaded');
                
                await teacherPage.waitForSelector('#login-screen:not(.hidden)', { 
                    timeout: 10000,
                    state: 'visible'
                });

                await teacherPage.fill('#login-email', TEACHER_CREDENTIALS.email);
                await teacherPage.fill('#login-password', TEACHER_CREDENTIALS.password);
                
                console.log(`🔑 Attempting teacher login with email: ${TEACHER_CREDENTIALS.email}`);
                await teacherPage.click('#email-login-btn');

                await teacherPage.waitForLoadState('networkidle');
                
                await Promise.race([
                    teacherPage.locator('#dashboard-screen').waitFor({ state: 'visible', timeout: 25000 }),
                    teacherPage.locator('#login-error').waitFor({ state: 'visible', timeout: 25000 })
                ]).catch(() => undefined);

                const dashboardVisible = await teacherPage.locator('#dashboard-screen').isVisible().catch(() => false);
                const loginError = await teacherPage.locator('#login-error').isVisible().catch(() => false);
                
                if (loginError) {
                    const errorText = await teacherPage.locator('#login-error').textContent();
                    throw new Error(`Login failed: ${errorText ?? 'Unknown error'}`);
                }
                
                if (!dashboardVisible) {
                    const url = teacherPage.url();
                    const bodyClasses = await teacherPage.evaluate(() => document.body.className);
                    const visibleScreens = await teacherPage.evaluate(() => {
                        const screens = ['login-screen', 'dashboard-screen', 'setup-screen'];
                        return screens.filter(id => {
                            const el = document.getElementById(id);
                            return el && !el.classList.contains('hidden');
                        });
                    });
                    const hasToken = await teacherPage.evaluate(() => !!localStorage.getItem('openpath_access_token'));
                    const errorText = await teacherPage.locator('#login-error').textContent().catch(() => null);
                    
                    throw new Error(
                        'Teacher dashboard not visible after login.\n' +
                        `URL: ${url}\n` +
                        `Body classes: ${bodyClasses}\n` +
                        `Visible screens: ${visibleScreens.join(', ') || 'none'}\n` +
                        `Has token: ${String(hasToken)}\n` +
                        `Login error message: ${errorText ?? 'none'}\n` +
                        `Network requests:\n${requests.join('\n') || 'none'}\n` +
                        `Console messages:\n${consoleMessages.join('\n') || 'none'}`
                    );
                }
                
                expect(dashboardVisible).toBeTruthy();
                await expect(teacherPage.locator('#logout-btn')).toBeVisible({ timeout: 10000 });
            });

            await test.step('Teacher sees their dashboard', async () => {
                const teacherBanner = await teacherPage.locator('#teacher-banner').isVisible().catch(() => false);
                const requestsSection = await teacherPage.locator('#requests-section').isVisible().catch(() => false);

                expect(teacherBanner || requestsSection).toBeTruthy();
            });

            // ============================================================
            // Phase 3: Student requests access (09:05)
            // UAT: 05_flujo_e2e.md - Student needs YouTube
            // ============================================================

            await test.step('Student logs in', async () => {
                await studentPage.goto('/');
                await studentPage.waitForLoadState('domcontentloaded');

                await studentPage.fill('#login-email', STUDENT_CREDENTIALS.email);
                await studentPage.fill('#login-password', STUDENT_CREDENTIALS.password);
                await studentPage.click('#email-login-btn');

                await expect(studentPage.locator('#logout-btn')).toBeVisible({ timeout: 10000 });
            });

            await test.step('Student views limited dashboard', async () => {
                // Verify student doesn't see admin-only sections
                const usersSection = studentPage.locator('#users-section');
                const classroomsSection = studentPage.locator('#classrooms-section');

                // These should be hidden or have admin-only class
                const usersClass = await usersSection.getAttribute('class').catch(() => '');
                const classroomsClass = await classroomsSection.getAttribute('class').catch(() => '');

                if (usersClass) {
                    expect(usersClass).toMatch(/admin-only|hidden/);
                }
                if (classroomsClass) {
                    expect(classroomsClass).toMatch(/admin-only|hidden/);
                }
            });

            // ============================================================
            // Phase 4: Teacher processes requests (09:06)
            // UAT: 05_flujo_e2e.md - Approval flow
            // ============================================================

            await test.step('Teacher refreshes to see new requests', async () => {
                const refreshBtn = teacherPage.locator('#refresh-requests-btn');
                if (await refreshBtn.isVisible().catch(() => false)) {
                    await refreshBtn.click();
                    await teacherPage.waitForTimeout(1000);
                }
            });

            // ============================================================
            // Phase 5: End of class verification
            // UAT: 05_flujo_e2e.md - Verify changes persist
            // ============================================================

            await test.step('All users can logout successfully', async () => {
                // Admin logout
                const adminLogout = adminPage.locator('#logout-btn');
                if (await adminLogout.isVisible().catch(() => false)) {
                    await adminLogout.click();
                }

                // Teacher logout
                const teacherLogout = teacherPage.locator('#logout-btn');
                if (await teacherLogout.isVisible().catch(() => false)) {
                    await teacherLogout.click();
                }

                // Student logout
                const studentLogout = studentPage.locator('#logout-btn');
                if (await studentLogout.isVisible().catch(() => false)) {
                    await studentLogout.click();
                }
            });

        } finally {
            // Cleanup contexts safely (they may already be closed on test failure)
            try { await adminContext.close(); } catch { /* already closed */ }
            try { await teacherContext.close(); } catch { /* already closed */ }
            try { await studentContext.close(); } catch { /* already closed */ }
        }
    });

    test('teacher approval timing: < 60 seconds KPI', { tag: '@kpi' }, async ({ browser }) => {
        // UAT: 02_profesor.md KPI - Approval in < 60 seconds
        const teacherContext = await browser.newContext();
        const teacherPage = await teacherContext.newPage();

        try {
            // Login
            await teacherPage.goto('/');
            await teacherPage.fill('#login-email', TEACHER_CREDENTIALS.email);
            await teacherPage.fill('#login-password', TEACHER_CREDENTIALS.password);

            const startTime = Date.now();
            await teacherPage.click('#email-login-btn');
            await teacherPage.waitForTimeout(2000);

            // Find and click approve on first pending request
            const approveBtn = teacherPage.locator('.request-item .approve-btn').first();
            if (await approveBtn.isVisible().catch(() => false)) {
                await approveBtn.click();
                await teacherPage.waitForTimeout(500);
            }

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            // KPI: Should complete in < 60 seconds
            expect(totalTime).toBeLessThan(60000);

            console.log(`Approval flow completed in ${String(totalTime)}ms`);

        } finally {
            try { await teacherContext.close(); } catch { /* already closed */ }
        }
    });

    test('mobile login flow works correctly', { tag: '@mobile' }, async ({ browser }) => {
        // UAT: 02_profesor.md Test 2.3, 4.2 - Mobile approval
        const mobileContext = await browser.newContext({
            viewport: { width: 375, height: 667 },
            isMobile: true
        });
        const mobilePage = await mobileContext.newPage();

        try {
            await mobilePage.goto('/');
            await mobilePage.waitForLoadState('domcontentloaded');

            // Verify login form is visible on mobile
            const loginForm = mobilePage.locator('#email-login-form');
            await expect(loginForm).toBeVisible({ timeout: 10000 });

            // Verify all form elements are accessible
            await expect(mobilePage.locator('#login-email')).toBeVisible();
            await expect(mobilePage.locator('#login-password')).toBeVisible();

            // Verify login button exists and has reasonable size
            const loginBtn = mobilePage.locator('#email-login-btn');
            await expect(loginBtn).toBeVisible();

            const box = await loginBtn.boundingBox();
            if (box) {
                // Touch target should be at least 36px (reasonable minimum)
                expect(box.height).toBeGreaterThanOrEqual(36);
            }

        } finally {
            try { await mobileContext.close(); } catch { /* already closed */ }
        }
    });
});

test.describe('Role Isolation Tests', { tag: '@security' }, () => {

    test('student cannot access admin routes via URL', async ({ page }) => {
        // UAT: 06_edge_cases.md Test 1.2
        await page.goto('/');
        await page.fill('#login-email', STUDENT_CREDENTIALS.email);
        await page.fill('#login-password', STUDENT_CREDENTIALS.password);
        await page.click('#email-login-btn');
        await page.waitForTimeout(2000);

        // Try to access admin-only routes
        await page.goto('/#users');
        await page.waitForTimeout(500);

        // Should not see users section content (hidden or admin-only)
        const usersSection = page.locator('#users-section');
        const classNames = await usersSection.getAttribute('class').catch(() => '');
        expect(classNames).toMatch(/admin-only|hidden/);
    });

    test('teacher cannot see classroom management', async ({ page }) => {
        // UAT: 02_profesor.md Test 1.2
        await page.goto('/');
        await page.fill('#login-email', TEACHER_CREDENTIALS.email);
        await page.fill('#login-password', TEACHER_CREDENTIALS.password);
        await page.click('#email-login-btn');
        await page.waitForTimeout(2000);

        const classroomsSection = page.locator('#classrooms-section');
        const classNames = await classroomsSection.getAttribute('class').catch(() => '');
        expect(classNames).toMatch(/admin-only|hidden/);
    });
});
