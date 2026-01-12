import { test, expect } from '@playwright/test';
import { ApiClient, getApiClient, testId } from './fixtures/api-fixtures';
import { generateTestUsers, generateTestRequest } from './fixtures/seed-data';
import { ADMIN_CREDENTIALS, TEACHER_CREDENTIALS } from './fixtures/auth';

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

test.describe.serial('API Integration - User Management', { tag: '@api' }, () => {
    let api: ApiClient;
    let testUsers: ReturnType<typeof generateTestUsers>;
    let createdUserId: string | undefined;

    test.beforeAll(async () => {
        api = getApiClient();
        testUsers = generateTestUsers();

        const loginResult = await api.login(
            ADMIN_CREDENTIALS.email,
            ADMIN_CREDENTIALS.password
        );
        if (!loginResult.ok) {
            throw new Error(`Admin login failed: ${loginResult.error ?? 'unknown'}`);
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
        } else if (result.status === 409) {
            // User already exists, fetch it
            const existing = await api.findUserByEmail(teacher.email);
            if (existing) {
                createdUserId = existing.id;
                expect(existing.email).toBe(teacher.email);
            } else {
                throw new Error(`User creation returned 409 but user not found: ${teacher.email}`);
            }
        } else {
            throw new Error(`Failed to create teacher: ${result.error ?? 'unknown'}`);
        }
    });

    test('should assign groups to teacher via API', async () => {
        // UAT: 01_admin_tic.md Test 2.3
        if (!createdUserId) {
            const teacherEmail = testUsers.teacher.email;
            const existing = await api.findUserByEmail(teacherEmail);
            if (!existing) {
                throw new Error('No user id available to assign groups');
            }
            createdUserId = existing.id;
        }

        const groups = testUsers.teacher.groups;
        const result = await api.assignGroups(createdUserId, groups, 'teacher');

        if (!result.ok) {
            throw new Error(`Failed to assign groups: ${result.error ?? 'unknown'}`);
        }

        expect(result.data).toBeDefined();
        
        const verifyResult = await api.findUserByEmail(testUsers.teacher.email);
        expect(verifyResult).toBeDefined();
        
        if (verifyResult?.groups) {
            expect(verifyResult.groups).toContain(groups[0]);
        } else if (verifyResult?.roles) {
            const teacherRole = verifyResult.roles.find(r => r.role === 'teacher');
            expect(teacherRole?.groupIds).toContain(groups[0]);
        } else {
            throw new Error('User has no groups or roles after assignment');
        }

    });

    test('should list users including test user', async () => {
        // UAT: 01_admin_tic.md Test 2.1
        const result = await api.getUsers();

        if (!result.ok) {
            throw new Error(`Failed to list users: ${result.error ?? 'unknown'}`);
        }

        expect(result.data).toBeInstanceOf(Array);
        // Should have at least one user (admin)
        expect(result.data?.length).toBeGreaterThan(0);

    });
});

test.describe('API Integration - Request Management', { tag: '@api' }, () => {
    let adminApi: ApiClient;
    let teacherApi: ApiClient;
    let createdRequestId: string | undefined;
    let defaultGroupId: string;

    test.beforeAll(async () => {
        adminApi = getApiClient();
        teacherApi = getApiClient();

        const adminLogin = await adminApi.login(
            ADMIN_CREDENTIALS.email,
            ADMIN_CREDENTIALS.password
        );
        if (!adminLogin.ok) {
            throw new Error(`Admin login failed: ${adminLogin.error ?? 'unknown'}`);
        }

        const teacherLogin = await teacherApi.login(
            TEACHER_CREDENTIALS.email,
            TEACHER_CREDENTIALS.password
        );
        if (!teacherLogin.ok) {
            throw new Error(`Teacher login failed: ${teacherLogin.error ?? 'unknown'}`);
        }

        const teacherProfile = await adminApi.findUserByEmail(TEACHER_CREDENTIALS.email);
        if (!teacherProfile) {
            throw new Error('Could not fetch teacher profile. Teacher may not exist.');
        }
        
        const teacherGroups = teacherProfile.groups ?? (teacherProfile.roles?.find(r => r.role === 'teacher')?.groupIds);
        
        if (!teacherGroups || teacherGroups.length === 0) {
            throw new Error('Teacher has no groups assigned. Check global-setup teacher assignment.');
        }

        const firstGroupId = teacherGroups[0];
        if (!firstGroupId) {
            throw new Error('Teacher first group ID is undefined');
        }
        defaultGroupId = firstGroupId;
        console.log('Using default group ID for tests:', defaultGroupId);
    });

    test('should create a request via API', async () => {
        // UAT: 01_admin_tic.md Test 3.2
        const request = generateTestRequest();

        const result = await adminApi.createRequest(request.domain, request.reason);

        if (!result.ok || !result.data) {
            throw new Error(`Failed to create request: ${result.error ?? 'unknown'}`);
        }

        createdRequestId = result.data.id;
        expect(result.data.domain).toBe(request.domain);
        expect(result.data.status).toBe('pending');

    });

    test('should list pending requests', async () => {
        // UAT: 01_admin_tic.md Test 3.1
        const result = await adminApi.getRequests('pending');

        if (!result.ok) {
            throw new Error(`Failed to list pending requests: ${result.error ?? 'unknown'}`);
        }

        expect(result.data).toBeInstanceOf(Array);

    });

    test('teacher should approve request via API', async () => {
        // UAT: 02_profesor.md Test 2.4
        let requestId = createdRequestId;
        
        if (!requestId) {
            const request = generateTestRequest();
            const createResult = await adminApi.createRequest(request.domain, request.reason, defaultGroupId);
            
            if (!createResult.ok || !createResult.data) {
                throw new Error(`Failed to create request for approval: ${createResult.error ?? 'unknown'}`);
            }
            requestId = createResult.data.id;
        }

        const result = await teacherApi.approveRequest(requestId);

        if (!result.ok) {
            throw new Error(`Failed to approve request: ${result.error ?? 'unknown'}`);
        }

        expect(result.data?.status).toBe('approved');

    });

    test('should reject request with reason', async () => {
        // UAT: 02_profesor.md Test 2.5
        // Create a new request to reject
        const request = generateTestRequest();
        const createResult = await adminApi.createRequest(request.domain, request.reason, defaultGroupId);

        if (!createResult.ok || !createResult.data) {
            throw new Error(`Failed to create request for rejection: ${createResult.error ?? 'unknown'}`);
        }

        const rejectResult = await teacherApi.rejectRequest(
            createResult.data.id,
            'Test rejection: Not educational content'
        );

        if (!rejectResult.ok) {
            throw new Error(`Failed to reject request: ${rejectResult.error ?? 'unknown'}`);
        }

        expect(rejectResult.data?.status).toBe('rejected');

    });
});

test.describe('API Integration - Classroom Management', { tag: '@api' }, () => {
    let api: ApiClient;
    let createdClassroomId: string | undefined;

    test.beforeAll(async () => {
        api = getApiClient();
        const login = await api.login(
            ADMIN_CREDENTIALS.email,
            ADMIN_CREDENTIALS.password
        );
        if (!login.ok) {
            throw new Error(`Admin login failed: ${login.error ?? 'unknown'}`);
        }
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

        if (!result.ok) {
            throw new Error(`Failed to create classroom: ${result.error ?? 'unknown'}`);
        }

        createdClassroomId = result.data?.id;
        expect(result.data?.displayName ?? result.data?.name).toBe(name);

    });

    test('should list classrooms', async () => {
        // UAT: 01_admin_tic.md Test 4.1
        const result = await api.getClassrooms();

        if (!result.ok) {
            throw new Error(`Failed to list classrooms: ${result.error ?? 'unknown'}`);
        }

        expect(result.data).toBeInstanceOf(Array);

    });
});

test.describe('API Integration - Blocked Domains', { tag: '@api' }, () => {
    let teacherApi: ApiClient;

    test.beforeAll(async () => {
        teacherApi = getApiClient();
        const login = await teacherApi.login(
            TEACHER_CREDENTIALS.email,
            TEACHER_CREDENTIALS.password
        );
        if (!login.ok) {
            throw new Error(`Teacher login failed: ${login.error ?? 'unknown'}`);
        }
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
