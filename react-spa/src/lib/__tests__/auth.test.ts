import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCurrentUser, isAdmin, isTeacher, isStudent, getTeacherGroups, User } from '../auth';

const USER_KEY = 'openpath_user';

describe('Auth functions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('getCurrentUser', () => {
    it('should return null if no user in localStorage', () => {
      expect(getCurrentUser()).toBeNull();
    });

    it('should return user object if valid JSON in localStorage', () => {
      const user: User = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        roles: [{ role: 'user' }],
      };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      expect(getCurrentUser()).toEqual(user);
    });

    it('should return null if invalid JSON in localStorage', () => {
      localStorage.setItem(USER_KEY, 'invalid-json');
      expect(getCurrentUser()).toBeNull();
    });
  });

  describe('isAdmin', () => {
    it('should return true if user has admin role', () => {
      const user: User = {
        id: '1',
        email: 'admin@example.com',
        name: 'Admin',
        roles: [{ role: 'admin' }],
      };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      expect(isAdmin()).toBe(true);
    });

    it('should return false if user does not have admin role', () => {
      const user: User = {
        id: '1',
        email: 'user@example.com',
        name: 'User',
        roles: [{ role: 'teacher' }],
      };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      expect(isAdmin()).toBe(false);
    });
  });

  describe('isTeacher', () => {
    it('should return true if user has teacher role', () => {
      const user: User = {
        id: '1',
        email: 'teacher@example.com',
        name: 'Teacher',
        roles: [{ role: 'teacher' }],
      };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      expect(isTeacher()).toBe(true);
    });
  });

  describe('isStudent', () => {
    it('should return true if user has student role', () => {
      const user: User = {
        id: '1',
        email: 'student@example.com',
        name: 'Student',
        roles: [{ role: 'student' }],
      };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      expect(isStudent()).toBe(true);
    });
  });

  describe('getTeacherGroups', () => {
    it('should return empty array if user is not teacher', () => {
      const user: User = {
        id: '1',
        email: 'admin@example.com',
        name: 'Admin',
        roles: [{ role: 'admin' }],
      };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      expect(getTeacherGroups()).toEqual([]);
    });

    it('should return unique group ids if user is teacher', () => {
      const user: User = {
        id: '1',
        email: 'teacher@example.com',
        name: 'Teacher',
        roles: [
          { role: 'teacher', groupIds: ['g1', 'g2'] },
          { role: 'teacher', groupIds: ['g2', 'g3'] },
        ],
      };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      const groups = getTeacherGroups();
      expect(groups).toHaveLength(3);
      expect(groups).toContain('g1');
      expect(groups).toContain('g2');
      expect(groups).toContain('g3');
    });
  });
});
