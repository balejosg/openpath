/**
 * API Fixtures for E2E Tests
 * 
 * Provides helpers for direct API calls during E2E tests.
 * Uses production API as configured.
 */

const API_BASE_URL = process.env.API_URL ?? 'http://localhost:3000';

interface ApiResponse<T = unknown> {
    ok: boolean;
    status: number;
    data: T | undefined;
    error: string | undefined;
}

interface User {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'teacher' | 'student';
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
    defaultGroup: string;
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

    async login(email: string, password: string): Promise<ApiResponse<{ token: string; user: User }>> {
        try {
            const response = await fetch(`${this.baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json() as { token?: string; message?: string; user?: User };
            if (response.ok && data.token) {
                this.authToken = data.token;
            }

            const user: User = data.user ?? { id: '', email: '', name: '', role: 'student' };
            return {
                ok: response.ok,
                status: response.status,
                data: response.ok ? { token: data.token ?? '', user } : undefined,
                error: !response.ok ? data.message : undefined
            };
        } catch (error) {
            return { ok: false, status: 0, data: undefined, error: String(error) };
        }
    }

    private async request<T>(
        method: string,
        path: string,
        body?: unknown,
        isTrpc = true
    ): Promise<ApiResponse<T>> {
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };
            if (this.authToken) {
                headers.Authorization = `Bearer ${this.authToken}`;
            }

            const fetchOptions: RequestInit = {
                method,
                headers
            };
            if (body) {
                fetchOptions.body = JSON.stringify(body);
            }

            const response = await fetch(`${this.baseUrl}${path}`, fetchOptions);

            const json = await response.json().catch(() => ({}));
            
            // Handle tRPC response structure
            let data = json;
            if (isTrpc && json && typeof json === 'object') {
                // Success: { result: { data: ... } }
                if ('result' in json) {
                    data = json.result.data;
                } 
                // Error: { error: { message: ... } }
                else if ('error' in json) {
                    // Normalize tRPC error to match ApiResponse expectations
                    return { 
                        ok: false, 
                        status: response.status, 
                        data: undefined, 
                        error: json.error.message ?? 'Unknown tRPC error' 
                    };
                }
            }

            return {
                ok: response.ok,
                status: response.status,
                data: response.ok ? data : undefined,
                error: !response.ok ? (data.message || data.error || 'Unknown error') : undefined
            };
        } catch (error) {
            return { ok: false, status: 0, data: undefined, error: String(error) };
        }
    }

    // User CRUD
    async createUser(user: { email: string; name: string; password: string; role: string }): Promise<ApiResponse<User>> {
        return this.request<User>('POST', '/trpc/users.create', user);
    }

    async deleteUser(userId: string): Promise<ApiResponse<null>> {
        return this.request<null>('POST', '/trpc/users.delete', { id: userId });
    }

    async getUsers(): Promise<ApiResponse<User[]>> {
        return this.request<User[]>('GET', '/trpc/users.list');
    }

    async assignGroups(userId: string, groups: readonly string[]): Promise<ApiResponse<User>> {
        return this.request<User>('POST', '/trpc/users.assignRole', { 
            userId, 
            role: 'teacher', 
            groupIds: groups 
        });
    }

    // Request CRUD
    async createRequest(domain: string, reason: string): Promise<ApiResponse<Request>> {
        return this.request<Request>('POST', '/trpc/requests.create', { domain, reason });
    }

    async approveRequest(requestId: string): Promise<ApiResponse<Request>> {
        return this.request<Request>('POST', '/trpc/requests.approve', { id: requestId });
    }

    async rejectRequest(requestId: string, reason?: string): Promise<ApiResponse<Request>> {
        return this.request<Request>('POST', '/trpc/requests.reject', { id: requestId, reason });
    }

    async getRequests(status?: string): Promise<ApiResponse<Request[]>> {
        const query = status 
            ? `?input=${encodeURIComponent(JSON.stringify({ status }))}` 
            : '';
        return this.request<Request[]>('GET', `/trpc/requests.list${query}`);
    }

    // Classroom CRUD
    async createClassroom(name: string, defaultGroup?: string): Promise<ApiResponse<Classroom>> {
        return this.request<Classroom>('POST', '/trpc/classrooms.create', { name, defaultGroupId: defaultGroup });
    }

    async deleteClassroom(classroomId: string): Promise<ApiResponse<null>> {
        return this.request<null>('POST', '/trpc/classrooms.delete', { id: classroomId });
    }

    async getClassrooms(): Promise<ApiResponse<Classroom[]>> {
        return this.request<Classroom[]>('GET', '/trpc/classrooms.list');
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
