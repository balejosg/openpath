/**
 * Seed Data for E2E Tests
 * 
 * Generates unique test data for each test run to avoid conflicts.
 * Data is created in production and cleaned up after tests.
 */

import { testId } from './api-fixtures';

/**
 * Generate unique test user credentials for a single test run
 */
export function generateTestUsers() {
    const runId = testId('run');

    return {
        admin: {
            email: `test-admin-${runId}@e2e.openpath.local`,
            password: 'E2ETestPass123!',
            name: `Test Admin ${runId}`,
            role: 'admin' as const
        },
        teacher: {
            email: `test-teacher-${runId}@e2e.openpath.local`,
            password: 'E2ETestPass123!',
            name: `Test Teacher ${runId}`,
            role: 'teacher' as const,
            groups: [`test-group-${runId}`]
        },
        student: {
            email: `test-student-${runId}@e2e.openpath.local`,
            password: 'E2ETestPass123!',
            name: `Test Student ${runId}`,
            role: 'student' as const
        }
    };
}

/**
 * Generate test classroom data
 */
export function generateTestClassroom() {
    const id = testId('classroom');
    return {
        name: `Test Classroom ${id}`,
        identifier: `test-classroom-${id}`,
        defaultGroup: `base-${id}`
    };
}

/**
 * Generate test request data
 */
export function generateTestRequest() {
    return {
        domain: `test-domain-${testId('domain')}.example.com`,
        reason: 'E2E test: Automated testing request'
    };
}

/**
 * Test domains for different scenarios
 */
export const TEST_DOMAINS = {
    // Always blocked domains (hardcoded in system)
    blocked: ['tiktok.com', 'instagram.com'],

    // Safe domains for testing (should be whitelisted)
    whitelisted: ['google.com', 'github.com', 'wikipedia.org'],

    // Domains for testing approval flow (not in whitelist)
    toApprove: ['youtube.com', 'vimeo.com']
} as const;

/**
 * Test groups
 */
export function generateTestGroups() {
    const id = testId('grp');
    return [
        `ciencias-${id}`,
        `historia-${id}`,
        `informatica-${id}`
    ];
}

/**
 * Cleanup marker - used to identify test data for cleanup
 */
export const TEST_DATA_MARKER = 'e2e.openpath.local';

/**
 * Check if an email belongs to test data (for cleanup)
 */
export function isTestData(email: string): boolean {
    return email.includes(TEST_DATA_MARKER);
}
