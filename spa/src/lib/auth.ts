import type { APIResponse, AuthTokens, StoredUser, User, UserRole } from '@/types';
import { trpc } from './trpc';
import { getAuthHeaders as getHeaders } from './headers';

const ACCESS_TOKEN_KEY = 'openpath_access_token';
const REFRESH_TOKEN_KEY = 'openpath_refresh_token';
const USER_KEY = 'openpath_user';
const LEGACY_TOKEN_KEY = 'requests_api_token';

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export const auth = {
  async login(email: string, password: string): Promise<APIResponse<{ user: User }>> {
    const data = await trpc.auth.login.mutate({ email, password });
    this.storeTokens(data);

    const backendUser = data.user as unknown as { id: string; email: string; name: string; roles: { role: string; groupIds: string[] }[] };

    const isValidRole = (role: string): role is UserRole => {
      return role === 'admin' || role === 'teacher' || role === 'student';
    };

    const user: User = {
      id: backendUser.id,
      email: backendUser.email,
      name: backendUser.name,
      roles: backendUser.roles
        .filter((roleInfo) => isValidRole(roleInfo.role))
        .map((roleInfo) => ({
          role: roleInfo.role as UserRole,
          groupIds: roleInfo.groupIds,
        })),
    };

    this.storeUser(user);
    return { success: true, data: { user } };
  },

  async logout(): Promise<void> {
    const refreshToken = this.getRefreshToken();
    try {
      await trpc.auth.logout.mutate({ refreshToken: refreshToken ?? undefined });
    } finally {
      this.clearAuth();
    }
  },

  async refresh(): Promise<APIResponse<AuthTokens>> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return { success: false, error: 'Cannot refresh: missing refresh token' };
    }

    try {
      const data = await trpc.auth.refresh.mutate({ refreshToken });
      this.storeTokens(data as AuthTokens);
      return { success: true, data: data as AuthTokens };
    } catch (error) {
      this.clearAuth();
      return { success: false, error: error instanceof Error ? error.message : 'Failed to refresh' };
    }
  },

  getUser(): StoredUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return safeJsonParse<StoredUser>(raw);
  },

  isAuthenticated(): boolean {
    return Boolean(this.getAccessToken() ?? localStorage.getItem(LEGACY_TOKEN_KEY));
  },

  hasRole(role: UserRole): boolean {
    const user = this.getUser();
    if (!user?.roles) {
      return Boolean(localStorage.getItem(LEGACY_TOKEN_KEY)) && role === 'admin';
    }
    return user.roles.some((roleInfo) => roleInfo.role === role);
  },

  isAdmin(): boolean {
    return this.hasRole('admin');
  },

  isTeacher(): boolean {
    return this.hasRole('teacher');
  },

  isStudent(): boolean {
    return this.hasRole('student');
  },

  getAuthHeaders(): Record<string, string> {
    return getHeaders();
  },

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  storeTokens(tokens: AuthTokens): void {
    if (tokens.accessToken) {
      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    }
    if (tokens.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    }
  },

  storeUser(user: User): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  clearAuth(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};
