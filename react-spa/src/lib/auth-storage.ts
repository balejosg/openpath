export const ACCESS_TOKEN_KEY = 'openpath_access_token';
export const REFRESH_TOKEN_KEY = 'openpath_refresh_token';
export const USER_KEY = 'openpath_user';

// Legacy key kept for backwards compatibility.
export const LEGACY_TOKEN_KEY = 'requests_api_token';

// Marker used by cookie-based session mode.
export const COOKIE_SESSION_MARKER = 'cookie-session';

function getLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeGetItem(key: string): string | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeRemoveItem(key: string): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getAccessToken(): string | null {
  return safeGetItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return safeGetItem(REFRESH_TOKEN_KEY);
}

export function getUserJson(): string | null {
  return safeGetItem(USER_KEY);
}

export function setAuthSession(accessToken: string, refreshToken: string, user: unknown): void {
  safeSetItem(ACCESS_TOKEN_KEY, accessToken);
  safeSetItem(REFRESH_TOKEN_KEY, refreshToken);
  try {
    safeSetItem(USER_KEY, JSON.stringify(user));
  } catch {
    safeRemoveItem(USER_KEY);
  }
}

/**
 * Token used for Authorization header.
 * Prefers access token, falls back to the legacy token if present.
 */
export function getAuthTokenForHeader(): string | null {
  const token = getAccessToken();
  if (token && token !== COOKIE_SESSION_MARKER) return token;
  return safeGetItem(LEGACY_TOKEN_KEY);
}

export function clearAuthStorage(): void {
  safeRemoveItem(ACCESS_TOKEN_KEY);
  safeRemoveItem(REFRESH_TOKEN_KEY);
  safeRemoveItem(USER_KEY);
  safeRemoveItem(LEGACY_TOKEN_KEY);
}

export function clearAuthAndReload(): void {
  clearAuthStorage();
  try {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  } catch {
    // ignore
  }
}
