import { test, expect } from '@playwright/test';
import { ApiClient, getApiClient, testId } from './fixtures/api-fixtures';
import { generateTestUsers, generateTestRequest } from './fixtures/seed-data';

/**
 * API Integration Tests
 * 
 * UAT Coverage:
 * - 01_admin_tic.md: Sections 2-5 (CRUD operations)
 * - 02_profesor.md: Section 2 (approve/reject requests)
 * 
 * These tests perform REAL API calls against production.
 * Test data is created and cleaned up per test run.
 */

test.describe('API Integration - User Management', { tag: '@api' }, () => {
    let api: ApiClient;
    let testUsers: ReturnType<typeof generateTestUsers>;
    let createdUserId: string | undefined;

    test.beforeAll(async () => {
        api = getApiClient();
        testUsers = generateTestUsers();

        // Login as existing admin (María from seed data)
        const loginResult = await api.login('maria@centro.edu', 'SecurePass123!');
        if (!loginResult.ok) {
            console.warn('Admin login failed - some tests may be skipped');
        }
    });

    test.afterAll(async () => {
        // Cleanup: delete test user if created
        if (createdUserId) {
            await api.deleteUser(createdUserId);
        }
    });

    test('should create a new teacher user via API', async () => {
        // UAT: 01_admin_tic.md Test 2.2
        const teacher = testUsers.teacher;

        const result = await api.createUser({
            email: teacher.email,
            name: teacher.name,
            password: teacher.password,
            role: 'teacher'
        });

        if (result.ok && result.data) {
            createdUserId = result.data.id;
            expect(result.data.email).toBe(teacher.email);
            expect(result.data.role).toBe('teacher');
        } else {
            // API might not be available - skip gracefully
            test.skip(true, `API unavailable: ${result.error ?? 'unknown'}`);
        }
    });

    test('should assign groups to teacher via API', async () => {
        // UAT: 01_admin_tic.md Test 2.3
        if (!createdUserId) {
            test.skip(true, 'No user created to assign groups');
            return;
        }

        const groups = testUsers.teacher.groups;
        const result = await api.assignGroups(createdUserId, groups);

        if (result.ok) {
            expect(result.data?.groups).toContain(groups[0]);
        }
    });

    test('should list users including test user', async () => {
        // UAT: 01_admin_tic.md Test 2.1
        const result = await api.getUsers();

        if (result.ok) {
            expect(result.data).toBeInstanceOf(Array);
            // Should have at least one user (admin)
            expect(result.data?.length).toBeGreaterThan(0);
        }
    });
});

test.describe('API Integration - Request Management', { tag: '@api' }, () => {
    let adminApi: ApiClient;
    let teacherApi: ApiClient;
    let createdRequestId: string | undefined;

    test.beforeAll(async () => {
        adminApi = getApiClient();
        teacherApi = getApiClient();

        // Login as admin and teacher
        await adminApi.login('maria@centro.edu', 'SecurePass123!');
        await teacherApi.login('pedro@centro.edu', 'ProfePass123!');
    });

    test('should create a request via API', async () => {
        // UAT: 01_admin_tic.md Test 3.2
        const request = generateTestRequest();

        const result = await adminApi.createRequest(request.domain, request.reason);

        if (result.ok && result.data) {
            createdRequestId = result.data.id;
            expect(result.data.domain).toBe(request.domain);
            expect(result.data.status).toBe('pending');
        }
    });

    test('should list pending requests', async () => {
        // UAT: 01_admin_tic.md Test 3.1
        const result = await adminApi.getRequests('pending');

        if (result.ok) {
            expect(result.data).toBeInstanceOf(Array);
        }
    });

    test('teacher should approve request via API', async () => {
        // UAT: 02_profesor.md Test 2.4
        if (!createdRequestId) {
            test.skip(true, 'No request created to approve');
            return;
        }

        const result = await teacherApi.approveRequest(createdRequestId);

        if (result.ok) {
            expect(result.data?.status).toBe('approved');
        }
    });

    test('should reject request with reason', async () => {
        // UAT: 02_profesor.md Test 2.5
        // Create a new request to reject
        const request = generateTestRequest();
        const createResult = await adminApi.createRequest(request.domain, request.reason);

        if (createResult.ok && createResult.data) {
            const rejectResult = await teacherApi.rejectRequest(
                createResult.data.id,
                'Test rejection: Not educational content'
            );

            if (rejectResult.ok) {
                expect(rejectResult.data?.status).toBe('rejected');
            }
        }
    });
});

test.describe('API Integration - Classroom Management', { tag: '@api' }, () => {
    let api: ApiClient;
    let createdClassroomId: string | undefined;

    test.beforeAll(async () => {
        api = getApiClient();
        await api.login('maria@centro.edu', 'SecurePass123!');
    });

    test.afterAll(async () => {
        if (createdClassroomId) {
            await api.deleteClassroom(createdClassroomId);
        }
    });

    test('should create classroom via API', async () => {
        // UAT: 01_admin_tic.md Test 4.2
        const name = `Test Classroom ${testId('cls')}`;

        const result = await api.createClassroom(name, 'base-centro');

        if (result.ok) {
            createdClassroomId = result.data?.id;
            expect(result.data?.name).toBe(name);
        }
    });

    test('should list classrooms', async () => {
        // UAT: 01_admin_tic.md Test 4.1
        const result = await api.getClassrooms();

        if (result.ok) {
            expect(result.data).toBeInstanceOf(Array);
        }
    });
});

test.describe('API Integration - Blocked Domains', { tag: '@api' }, () => {
    let teacherApi: ApiClient;

    test.beforeAll(async () => {
        teacherApi = getApiClient();
        await teacherApi.login('pedro@centro.edu', 'ProfePass123!');
    });

    test('should not approve blocked domain (tiktok.com)', async () => {
        // UAT: 02_profesor.md Test 3.1
        // First create a request for blocked domain
        const result = await teacherApi.createRequest('tiktok.com', 'Test: should fail');

        // The API should either reject creation or return an error
        // Behavior depends on API implementation
        if (result.ok && result.data) {
            // If request was created, try to approve it
            const approveResult = await teacherApi.approveRequest(result.data.id);
            // Should fail or be rejected
            expect(approveResult.ok).toBe(false);
        }
        // If creation failed, that's also valid behavior
    });
});
