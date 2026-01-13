/**
 * OpenPath - Frontend Unit Tests
 * Tests for SPA JavaScript functions
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

// ============================================
// relativeTime() function tests
// ============================================
void describe('relativeTime() function', () => {
    // Mock the function from app.js
    function relativeTime(dateString: string): string {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);

        if (diffSec < 60) return 'ahora';
        if (diffMin < 60) return `hace ${diffMin.toString()} min`;
        if (diffHour < 24) return `hace ${diffHour.toString()}h`;
        if (diffDay < 7) return `hace ${diffDay.toString()} días`;
        return date.toLocaleDateString();
    }

    void test('should return "ahora" for just now', () => {
        const now = new Date().toISOString();
        assert.strictEqual(relativeTime(now), 'ahora');
    });

    void test('should return minutes for recent times', () => {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        assert.strictEqual(relativeTime(fiveMinAgo), 'hace 5 min');
    });

    void test('should return hours for older times', () => {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        assert.strictEqual(relativeTime(twoHoursAgo), 'hace 2h');
    });

    void test('should return days for old times', () => {
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        assert.strictEqual(relativeTime(threeDaysAgo), 'hace 3 días');
    });

    void test('should return date for very old times', () => {
        const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const result = relativeTime(twoWeeksAgo);
        // Should be a date format, not relative
        assert.ok(!result.includes('hace'), `Expected date format, got: ${result}`);
    });
});

// ============================================
// auth object method tests
// ============================================

interface User {
    roles?: { role: string; groupIds?: string[] }[];
    email?: string;
}

interface AuthMock {
    user: User | undefined;
    getUser(): User | undefined;
    isAdmin(): boolean;
    hasRole(role: string): boolean;
    getApprovalGroups(): string | string[];
    getTeacherGroups(): string[];
    getAssignedGroups(): string[];
    isTeacher(): boolean;
    isStudent(): boolean;
}

// Mock auth object with minimal implementation
const createMockAuth = (user?: User): AuthMock => ({
    user,
    getUser() { return this.user; },
    isAdmin() {
        return this.user?.roles?.some(r => r.role === 'admin') ?? false;
    },
    hasRole(role) {
        return this.user?.roles?.some(r => r.role === role) ?? false;
    },
    getApprovalGroups() {
        if (this.isAdmin()) return 'all';
        if (!this.user?.roles) return [];
        const groups = new Set<string>();
        this.user.roles
            .filter(r => r.role === 'teacher')
            .forEach(r => { (r.groupIds ?? []).forEach(g => { groups.add(g); }); });
        return Array.from(groups);
    },
    getTeacherGroups() {
        const groups = this.getApprovalGroups();
        return typeof groups === 'string' ? [] : groups;
    },
    getAssignedGroups() {
        return this.getTeacherGroups();
    },
    isTeacher() {
        return this.hasRole('teacher');
    },
    isStudent() {
        return this.hasRole('student');
    }
});

void describe('auth.getTeacherGroups()', () => {
    void test('should return empty array if user has no roles', () => {
        const auth = createMockAuth({});
        assert.deepStrictEqual(auth.getTeacherGroups(), []);
    });

    void test('should return group names if user is teacher', () => {
        const auth = createMockAuth({
            roles: [{ role: 'teacher', groupIds: ['g1', 'g2'] }]
        });
        assert.deepStrictEqual(auth.getTeacherGroups(), ['g1', 'g2']);
    });

    void test('should handle teacher with multiple role entries', () => {
        const auth = createMockAuth({
            roles: [
                { role: 'teacher', groupIds: ['g1'] },
                { role: 'teacher', groupIds: ['g2', 'g1'] }
            ]
        });
        const result = auth.getTeacherGroups();
        assert.strictEqual(result.length, 2);
        assert.ok(result.includes('g1'));
        assert.ok(result.includes('g2'));
    });

    void test('should return empty if user is admin (admin sees ALL)', () => {
        const auth = createMockAuth({ roles: [{ role: 'admin' }] });
        // getTeacherGroups returns [] for admin because getApprovalGroups returns 'all'
        assert.deepStrictEqual(auth.getTeacherGroups(), []);
    });
});

void describe('auth.isTeacher()', () => {
    void test('should return true if user has teacher role', () => {
        const auth = createMockAuth({ roles: [{ role: 'teacher' }] });
        assert.strictEqual(auth.isTeacher(), true);
    });

    void test('should return false if user is only student', () => {
        const auth = createMockAuth({ roles: [{ role: 'student' }] });
        assert.strictEqual(auth.isTeacher(), false);
    });
});

void describe('auth.isStudent()', () => {
    void test('should return true if user has student role', () => {
        const auth = createMockAuth({ roles: [{ role: 'student' }] });
        assert.strictEqual(auth.isStudent(), true);
    });
});

void describe('auth.getAssignedGroups() alias', () => {
    void test('should return the same as teacher groups', () => {
        const mockUser = { roles: [{ role: 'teacher', groupIds: ['a', 'b'] }] };
        const mockAuth = createMockAuth(mockUser);
        assert.deepStrictEqual(
            mockAuth.getAssignedGroups(),
            mockAuth.getTeacherGroups()
        );
    });
});
