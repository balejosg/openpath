import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ACCESS_TOKEN_KEY,
  COOKIE_SESSION_MARKER,
  LEGACY_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  USER_KEY,
  clearAuthAndReload,
  clearAuthStorage,
  getAccessToken,
  getAuthTokenForHeader,
  getRefreshToken,
  getUserJson,
  setAuthSession,
} from '../auth-storage';

describe('auth-storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gets and sets tokens and user JSON', () => {
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(getUserJson()).toBeNull();

    setAuthSession('access', 'refresh', { id: 'u1', name: 'Test' });

    expect(getAccessToken()).toBe('access');
    expect(getRefreshToken()).toBe('refresh');
    expect(getUserJson()).toBe(JSON.stringify({ id: 'u1', name: 'Test' }));
  });

  it('removes user key when user cannot be stringified', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    setAuthSession('access', 'refresh', circular);

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh');
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });

  it('prefers access token for Authorization header', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'access');
    localStorage.setItem(LEGACY_TOKEN_KEY, 'legacy');
    expect(getAuthTokenForHeader()).toBe('access');
  });

  it('falls back to legacy token when access token is cookie-session marker', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, COOKIE_SESSION_MARKER);
    localStorage.setItem(LEGACY_TOKEN_KEY, 'legacy');
    expect(getAuthTokenForHeader()).toBe('legacy');
  });

  it('clears all auth keys', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'access');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh');
    localStorage.setItem(USER_KEY, '{}');
    localStorage.setItem(LEGACY_TOKEN_KEY, 'legacy');

    clearAuthStorage();

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_TOKEN_KEY)).toBeNull();
  });

  it('clearAuthAndReload clears keys and never throws', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'access');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh');
    localStorage.setItem(USER_KEY, '{}');
    localStorage.setItem(LEGACY_TOKEN_KEY, 'legacy');

    expect(() => clearAuthAndReload()).not.toThrow();

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_TOKEN_KEY)).toBeNull();
  });

  it('returns null when storage access throws', () => {
    const getItemSpy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(getAccessToken()).toBeNull();

    getItemSpy.mockRestore();
  });

  it('does not throw when set/remove access throws', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('boom');
    });
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => setAuthSession('a', 'r', { id: 'x' })).not.toThrow();
    expect(() => clearAuthStorage()).not.toThrow();
  });
});
