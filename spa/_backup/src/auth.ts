import { z } from 'zod';
import { getErrorMessage, safeJsonParse, RoleInfo } from '@openpath/shared';
import type { AuthAPI, AuthTokens, StoredUser, User, UserRole, APIResponse } from './types/index.js';
import { trpc } from './trpc.js';
import { logger } from './lib/logger.js';
import { getStorage, isLocalStorageAvailable } from './lib/storage.js';
import { showToast } from './utils.js';

// Stored user schema for validation
const StoredUserSchema = z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    roles: z.array(RoleInfo)
});

/**
 * Authentication API Client
 * Handles JWT-based authentication for the OpenPath SPA
 */
export const auth: AuthAPI = {
    // Storage keys
    ACCESS_TOKEN_KEY: 'openpath_access_token',
    REFRESH_TOKEN_KEY: 'openpath_refresh_token',
    USER_KEY: 'openpath_user',

    // API base URL (uses RequestsAPI config if available)
    getApiUrl(): string {
        if (typeof window === 'undefined') return '';
        return getStorage().getItem('requests_api_url') ?? '';
    },

    // ==========================================================================
    // Token Management
    // ==========================================================================

    getAccessToken(): string | null {
        if (typeof window === 'undefined') return null;
        return getStorage().getItem(this.ACCESS_TOKEN_KEY);
    },

    getToken(): string | null {
        return this.getAccessToken();
    },

    getRefreshToken(): string | null {
        if (typeof window === 'undefined') return null;
        return getStorage().getItem(this.REFRESH_TOKEN_KEY);
    },

    getAuthHeaders(): Record<string, string> {
        const token = this.getAccessToken();
        if (!token) {
            const adminToken = typeof window !== 'undefined' ? getStorage().getItem('requests_api_token') : null;
            return {
                'Content-Type': 'application/json',
                'Authorization': adminToken ? `Bearer ${adminToken}` : ''
            };
        }
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    },

    storeTokens(tokens: AuthTokens): void {
        if (typeof window === 'undefined') return;
        if (!isLocalStorageAvailable()) {
            showToast('Tu navegador está bloqueando el almacenamiento. Desactiva la protección antirrastreo para iniciar sesión.', 'error');
        }
        const storage = getStorage();
        if (tokens.accessToken) {
            storage.setItem(this.ACCESS_TOKEN_KEY, tokens.accessToken);
        }
        if (tokens.refreshToken) {
            storage.setItem(this.REFRESH_TOKEN_KEY, tokens.refreshToken);
        }
    },

    storeUser(user: User): void {
        if (typeof window === 'undefined') return;
        getStorage().setItem(this.USER_KEY, JSON.stringify(user));
    },

    getUser(): StoredUser | null {
        if (typeof window === 'undefined') return null;
        const stored = getStorage().getItem(this.USER_KEY);
        if (!stored) return null;
        const result = safeJsonParse(stored, StoredUserSchema);
        if (result.success) {
            return result.data as StoredUser;
        }
        const errorMsg = 'error' in result ? (result.error instanceof Error ? result.error.message : 'Validation error') : 'Unknown error';
        logger.error('Failed to parse stored user', { error: errorMsg });
        return null;
    },

    clearAuth(): void {
        if (typeof window === 'undefined') return;
        const storage = getStorage();
        storage.removeItem(this.ACCESS_TOKEN_KEY);
        storage.removeItem(this.REFRESH_TOKEN_KEY);
        storage.removeItem(this.USER_KEY);
    },

    isAuthenticated(): boolean {
        if (typeof window === 'undefined') return false;
        return !!(this.getAccessToken() ?? getStorage().getItem('requests_api_token'));
    },

    hasRole(role: UserRole): boolean {
        const user = this.getUser();
        if (!user?.roles) {
            if (typeof window !== 'undefined' && getStorage().getItem('requests_api_token')) {
                return role === 'admin';
            }
            return false;
        }
        return user.roles.some((r) => r.role === role);
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

    getApprovalGroups(): string[] | 'all' {
        if (this.isAdmin()) {
            return 'all';
        }
        const user = this.getUser();
        if (!user?.roles) return [];

        const groups = new Set<string>();
        user.roles.forEach((r) => {
            if (r.role === 'teacher') {
                r.groupIds.forEach((g) => groups.add(g));
            }
        });

        return Array.from(groups);
    },

    getTeacherGroups(): string[] {
        const groups = this.getApprovalGroups();
        return groups === 'all' ? [] : groups;
    },

    getAssignedGroups(): string[] {
        return this.getTeacherGroups();
    },

    // ==========================================================================
    // API Methods
    // ==========================================================================

    async login(email: string, password: string): Promise<APIResponse<{ user: User }>> {
        try {
            const data = await trpc.auth.login.mutate({ email, password });
            this.storeTokens(data);
            
            // The backend returns roles but the type doesn't reflect it
            // Cast to unknown then to the expected shape
            const backendUser = data.user as unknown as { id: string; email: string; name: string; roles: RoleInfo[] };
            
            const user: User = {
                id: backendUser.id,
                email: backendUser.email,
                name: backendUser.name,
                roles: backendUser.roles.map(r => ({
                    role: r.role,
                    groupIds: r.groupIds
                }))
            };
            
            this.storeUser(user);
            return { success: true, data: { user } };
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            throw new Error(message);
        }
    },

    async register(email: string, name: string, password: string): Promise<APIResponse<{ user: User }>> {
        try {
            const data = await trpc.auth.register.mutate({ email, name, password });
            const user: User = {
                id: data.user.id,
                email: data.user.email,
                name: data.user.name,
                roles: [] // New users have no roles initially
            };
            return { success: true, data: { user } };
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            throw new Error(message);
        }
    },

    async refresh(): Promise<APIResponse<AuthTokens>> {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
            throw new Error('Cannot refresh: missing refresh token');
        }

        try {
            const data = await trpc.auth.refresh.mutate({ refreshToken });
            this.storeTokens(data as AuthTokens);
            return { success: true, data: data as AuthTokens };
        } catch (error: unknown) {
            this.clearAuth();
            const message = getErrorMessage(error);
            throw new Error(message);
        }
    },

    async logout(): Promise<void> {
        try {
            const refreshToken = this.getRefreshToken();
            await trpc.auth.logout.mutate({ refreshToken: refreshToken ?? undefined });
        } catch (e) {
            logger.warn('Logout API call failed', { error: getErrorMessage(e) });
        }
        this.clearAuth();
    },

    async getMe(): Promise<APIResponse<{ user: User }>> {
        try {
            const data = await trpc.auth.me.query();
            
            // The backend returns roles but the type doesn't reflect it
            const backendUser = data.user as unknown as { id: string; email: string; name: string; roles: RoleInfo[] };
            
            const user: User = {
                id: backendUser.id,
                email: backendUser.email,
                name: backendUser.name,
                roles: backendUser.roles.map(r => ({
                    role: r.role,
                    groupIds: r.groupIds
                }))
            };
            this.storeUser(user);
            return { success: true, data: { user } };
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            throw new Error(message);
        }
    },

    async fetch(url: string, options: RequestInit = {}): Promise<Response> {
        const headers: Record<string, string> = {
            ...this.getAuthHeaders(),
            ...((options.headers ?? {}) as Record<string, string>)
        };
        return window.fetch(url, { ...options, headers });
    }
};
