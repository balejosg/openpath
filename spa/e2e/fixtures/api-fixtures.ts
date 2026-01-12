/**
 * API Fixtures for E2E Tests
 * 
 * Provides helpers for direct API calls during E2E tests.
 * Uses production API as configured.
 */

const API_BASE_URL = process.env.BASE_URL ?? process.env.API_URL ?? 'http://localhost:3005';

interface ApiResponse<T = unknown> {
    ok: boolean;
    status: number;
    data: T | undefined;
    error: string | undefined;
}

interface Role {
    id: string;
    role: 'admin' | 'teacher' | 'student';
    groupIds: string[];
}

interface User {
    id: string;
    email: string;
    name: string;
    role?: 'admin' | 'teacher' | 'student';
    roles?: Role[];
    groups?: string[];
}

interface Request {
    id: string;
    domain: string;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: string;
}

interface Classroom {
    id: string;
    name: string;
    displayName?: string;
    defaultGroup?: string;
    defaultGroupId?: string | null;
}

/**
 * API Client for E2E tests
 */
export class ApiClient {
    private authToken: string | null = null;

    constructor(private baseUrl: string = API_BASE_URL) { }

    setAuthToken(token: string): void {
        this.authToken = token;
    }

    private normalizeUser(user: User): User {
        if (user.roles && user.roles.length > 0 && !user.role) {
            const primaryRole = user.roles.find(r => r.role === 'admin') ?? 
                               user.roles.find(r => r.role === 'teacher') ?? 
                               user.roles[0];
            if (primaryRole) {
                user.role = primaryRole.role;
                user.groups = primaryRole.groupIds;
            }
        }
        return user;
    }

    async login(email: string, password: string): Promise<ApiResponse<{ token: string; user: User }>> {
        try {
            const response = await fetch(`${this.baseUrl}/trpc/auth.login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json() as { result?: { data?: { accessToken?: string; user?: User } }; error?: { message?: string } };
            
            const result = data.result?.data;
            if (response.ok && result?.accessToken) {
                this.authToken = result.accessToken;
                return {
                    ok: true,
                    status: response.status,
                    data: { token: result.accessToken, user: result.user ?? { id: '', email: '', name: '', role: 'student' } },
                    error: undefined
                };
            }

            return {
                ok: false,
                status: response.status,
                data: undefined,
                error: data.error?.message ?? `HTTP ${String(response.status)}`
            };
        } catch (error) {
            return { ok: false, status: 0, data: undefined, error: `Network error: ${String(error)}` };
        }
    }

    private async trpcMutation<T>(
        procedure: string,
        input?: unknown
    ): Promise<ApiResponse<T>> {
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };
            if (this.authToken) {
                headers.Authorization = `Bearer ${this.authToken}`;
            }

            const response = await fetch(`${this.baseUrl}/trpc/${procedure}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(input ?? {})
            });

            const data = await response.json() as { result?: { data?: T }; error?: { message?: string; code?: number; data?: { code?: string; httpStatus?: number } } };
            
            if (response.ok && data.result?.data) {
                return {
                    ok: true,
                    status: response.status,
                    data: data.result.data,
                    error: undefined
                };
            }

            return {
                ok: false,
                status: data.error?.data?.httpStatus ?? response.status,
                data: undefined,
                error: data.error?.message ?? `HTTP ${String(response.status)}`
            };
        } catch (error) {
            return { ok: false, status: 0, data: undefined, error: `Network error: ${String(error)}` };
        }
    }

    private async trpcQuery<T>(
        procedure: string,
        input?: unknown
    ): Promise<ApiResponse<T>> {
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };
            if (this.authToken) {
                headers.Authorization = `Bearer ${this.authToken}`;
            }

            const params = input ? `?input=${encodeURIComponent(JSON.stringify(input))}` : '';
            const response = await fetch(`${this.baseUrl}/trpc/${procedure}${params}`, {
                method: 'GET',
                headers
            });

            const data = await response.json() as { result?: { data?: T }; error?: { message?: string; code?: number; data?: { code?: string; httpStatus?: number } } };
            
            if (response.ok && data.result?.data !== undefined) {
                return {
                    ok: true,
                    status: response.status,
                    data: data.result.data,
                    error: undefined
                };
            }

            return {
                ok: false,
                status: data.error?.data?.httpStatus ?? response.status,
                data: undefined,
                error: data.error?.message ?? `HTTP ${String(response.status)}`
            };
        } catch (error) {
            return { ok: false, status: 0, data: undefined, error: `Network error: ${String(error)}` };
        }
    }

    // User CRUD
    async createUser(user: { email: string; name: string; password: string; role: string }): Promise<ApiResponse<User>> {
        const result = await this.trpcMutation<User>('users.create', user);
        if (result.ok && result.data) {
            result.data = this.normalizeUser(result.data);
        }
        return result;
    }

    async deleteUser(userId: string): Promise<ApiResponse<null>> {
        return this.trpcMutation<null>('users.delete', { id: userId });
    }

    async getUsers(): Promise<ApiResponse<User[]>> {
        const result = await this.trpcQuery<User[]>('users.list');
        if (result.ok && result.data) {
            result.data = result.data.map(u => this.normalizeUser(u));
        }
        return result;
    }

    async findUserByEmail(email: string): Promise<User | undefined> {
        const result = await this.getUsers();
        if (!result.ok || !result.data) {
            return undefined;
        }
        return result.data.find(u => u.email === email);
    }

    async assignGroups(userId: string, groups: readonly string[], role = 'teacher'): Promise<ApiResponse<User>> {
        const result = await this.trpcMutation<User>('users.assignRole', { userId, role, groupIds: Array.from(groups) });
        if (result.ok && result.data) {
            result.data = this.normalizeUser(result.data);
        }
        return result;
    }

    // Request CRUD
    async createRequest(domain: string, reason: string, groupId?: string): Promise<ApiResponse<Request>> {
        return this.trpcMutation<Request>('requests.create', { domain, reason, groupId });
    }

    async approveRequest(requestId: string): Promise<ApiResponse<Request>> {
        return this.trpcMutation<Request>('requests.approve', { id: requestId });
    }

    async rejectRequest(requestId: string, reason?: string): Promise<ApiResponse<Request>> {
        return this.trpcMutation<Request>('requests.reject', { id: requestId, reason });
    }

    async getRequests(status?: string): Promise<ApiResponse<Request[]>> {
        return this.trpcQuery<Request[]>('requests.list', status ? { status } : undefined);
    }

    // Classroom CRUD
    async createClassroom(name: string, defaultGroup?: string): Promise<ApiResponse<Classroom>> {
        return this.trpcMutation<Classroom>('classrooms.create', { name, defaultGroupId: defaultGroup });
    }

    async deleteClassroom(classroomId: string): Promise<ApiResponse<null>> {
        return this.trpcMutation<null>('classrooms.delete', { id: classroomId });
    }

    async getClassrooms(): Promise<ApiResponse<Classroom[]>> {
        return this.trpcQuery<Classroom[]>('classrooms.list');
    }
}

/**
 * Create a new API client instance
 */
export function getApiClient(baseUrl?: string): ApiClient {
    return new ApiClient(baseUrl);
}

/**
 * Helper to generate unique test identifiers
 */
export function testId(prefix: string): string {
    return `${prefix}-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
}
