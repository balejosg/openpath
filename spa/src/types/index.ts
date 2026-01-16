/**
 * OpenPath SPA - Type Definitions
 * Shared types for the frontend dashboard
 */

// =============================================================================
// Re-export Domain Types from API (single source of truth)
// =============================================================================

export type {
    RequestStatus,
    RequestPriority,
    UserRole,
    MachineStatus,
    DomainRequest,
    RoleInfo,
    APIResponseType as APIResponse,
    PaginatedResponse,
} from '@openpath/shared';

// =============================================================================
// SPA-Specific Entity Extensions (frontend-only fields)
// =============================================================================

import type { UserRole, RoleInfo, MachineStatus, DomainRequest, APIResponseType as APIResponse } from '@openpath/shared';

export interface UserRoleInfo {
    id: string;
    userId: string;
    role: UserRole;
    createdBy: string;
    revokedAt: string | null;
    groupIds: string[];
    createdAt: string;
    updatedAt: string;
}

export interface ClassroomStats {
    totalClassrooms: number;
    totalMachines: number;
    onlineMachines: number;
    offlineMachines: number;
    unknownMachines: number;
}

/**
 * User (safe version for frontend, with optional GitHub fields)
 */
export interface User {
    id: string;
    email: string;
    name: string;
    login?: string | undefined; // GitHub login
    avatarUrl?: string | undefined; // GitHub/S3 avatar
    roles: RoleInfo[];
}

/**
 * Classroom (with frontend-specific computed fields)
 */
export interface Classroom {
    id: string;
    name: string;
    displayName: string;
    machines?: Machine[];
    createdAt: string;
    updatedAt: string;
    activeGroupId?: string | null;
    defaultGroupId?: string | null;
    currentGroupId?: string | null;
    machineCount?: number;
}

/**
 * Machine (simplified for display)
 */
export interface Machine {
    id?: string;
    hostname: string;
    classroomId?: string | null;
    version?: string;
    lastSeen: string | null;
    status: MachineStatus;
}

/**
 * Schedule (with frontend-specific fields)
 */
export interface Schedule {
    id: string;
    classroomId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    groupId: string;
    teacherId: string;
    teacherName?: string;
    subject?: string;
    active?: boolean;
    isMine?: boolean;
    canEdit?: boolean;
}

export interface ScheduleSlot {
    start: string;
    end: string;
}

// =============================================================================
// Auth Types
// =============================================================================

/**
 * Token pair from login
 */
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: string | number;
    tokenType?: string;
}

/**
 * Stored user info (from JWT)
 */
export interface StoredUser {
    id: string;
    email: string;
    name: string;
    roles: RoleInfo[];
}


// =============================================================================
// State Types
// =============================================================================

/**
 * SPA configuration
 */
export interface SPAConfig {
    owner: string | undefined;
    repo: string | undefined;
    branch: string | undefined;
    whitelistPath: string | undefined;
    token?: string | undefined;
    gruposDir?: string | undefined;
}

export interface GitHubAPIInstance {
    token: string;
    owner: string;
    repo: string;
    branch: string;
    getFile(path: string): Promise<GitHubFile | null>;
    updateFile(path: string, content: string, message: string, sha: string): Promise<boolean>;
    listDirectory(path: string): Promise<string[]>;
    listFiles(path: string): Promise<{ name: string, path: string, sha: string }[]>;
    getRawUrl(path: string): string;
    deleteFile(path: string, message: string, sha: string): Promise<boolean>;
}

/**
 * GitHub file response
 */
export interface GitHubFile {
    path: string;
    sha: string;
    content: string;
    encoding: string;
}

/**
 * Group data (whitelist content)
 */
export interface GroupData {
    enabled: boolean;
    whitelist: string[];
    blockedSubdomains: string[];
    blockedPaths: string[];
}

/**
 * Whitelist rule entry
 */
export interface WhitelistRule {
    domain: string;
    comment?: string;
    addedAt?: string;
    addedBy?: string;
}

/**
 * Whitelist group
 */
export interface Group {
    name: string;
    path: string;
    sha: string;
    stats?: { whitelist: number; blockedSubdomains: number; blockedPaths: number };
    enabled?: boolean;
}

/**
 * Application state
 */
export interface AppState {
    github: GitHubAPIInstance | null;
    currentGroup: string | null;
    currentGroupData: GroupData | null;
    currentGroupSha: string | null;
    currentRuleType: 'whitelist' | 'blockedSubdomains' | 'blockedPaths';
    allGroups: Group[];
    currentUser: User | null;
    canEdit: boolean;
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Paginated response
 */
export interface PaginatedAPIResponse<T> extends APIResponse<T[]> {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

/**
 * Requests list response
 */
export interface RequestsResponse extends APIResponse<DomainRequest[]> {
    requests: DomainRequest[];
}

/**
 * Classrooms list response
 */
export interface ClassroomsResponse extends APIResponse<Classroom[]> {
    classrooms: Classroom[];
}

/**
 * Schedules list response
 */
export interface SchedulesResponse extends APIResponse<Schedule[]> {
    schedules: Schedule[];
}

/**
 * Users list response
 */
export interface UsersResponse extends APIResponse<User[]> {
    users: User[];
}

/**
 * Requests API configuration
 */
export interface RequestsAPIConfig {
    apiUrl: string;
    token?: string | undefined;
}

// =============================================================================
// UI Types
// =============================================================================

/**
 * Screen names
 */
export type ScreenName =
    | 'login-screen'
    | 'config-screen'
    | 'dashboard-screen'
    | 'loading-screen';

/**
 * Toast notification type
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/**
 * Toast notification
 */
export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

/**
 * Modal configuration
 */
export interface ModalConfig {
    title: string;
    content: string | HTMLElement;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void;
}

// =============================================================================
// Push Notifications
// =============================================================================

/**
 * Push subscription for server
 */
export interface PushSubscriptionData {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}

/**
 * Push notification payload
 */
export interface PushNotificationPayload {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: Record<string, unknown>;
}

// =============================================================================
// Global Window Extensions
// =============================================================================

declare global {
    interface Window {
        auth: AuthAPI;
        config: ConfigAPI;
        setup: typeof import('../setup.js').setup;
        GitHubAPI: new (token: string, owner: string, repo: string, branch: string) => GitHubAPIInstance;
        schedulesModule: typeof import('../modules/schedules.js').schedulesModule;
        requestsAPI: RequestsAPIInstance;
    }
}

/**
 * Auth API interface
 */
export interface AuthAPI {
    ACCESS_TOKEN_KEY: string;
    REFRESH_TOKEN_KEY: string;
    USER_KEY: string;
    getApiUrl(): string;
    getAccessToken(): string | null;
    getToken(): string | null;
    getRefreshToken(): string | null;
    getAuthHeaders(): Record<string, string>;
    storeTokens(tokens: AuthTokens): void;
    storeUser(user: User): void;
    getUser(): StoredUser | null;
    clearAuth(): void;
    isAuthenticated(): boolean;
    hasRole(role: UserRole): boolean;
    isAdmin(): boolean;
    isTeacher(): boolean;
    isStudent(): boolean;
    getApprovalGroups(): string[] | 'all';
    getTeacherGroups(): string[];
    getAssignedGroups(): string[];
    login(email: string, password: string): Promise<APIResponse<{ user: User }>>;
    register(email: string, name: string, password: string): Promise<APIResponse<{ user: User }>>;
    refresh(): Promise<APIResponse<AuthTokens>>;
    logout(): Promise<void>;
    getMe(): Promise<APIResponse<{ user: User }>>;
    fetch(url: string, options?: RequestInit): Promise<Response>;
}


/**
 * Requests API instance interface
 */
export interface RequestsAPIInstance {
    apiUrl: string;
    init(url: string, token?: string): void;
    isConfigured(): boolean;
    healthCheck(): Promise<boolean>;
    getRequests(status?: import('@openpath/shared').RequestStatus): Promise<RequestsResponse>;
    getPendingRequests(): Promise<RequestsResponse>;
    createRequest(data: { domain: string; reason?: string }): Promise<APIResponse<DomainRequest>>;
    approveRequest(id: string, groupId?: string, token?: string): Promise<APIResponse<DomainRequest>>;
    rejectRequest(id: string, reason?: string, token?: string): Promise<APIResponse<DomainRequest>>;
    deleteRequest(id: string): Promise<APIResponse<void>>;
}

/**
 * Config API interface
 */
export interface ConfigAPI {
    get(): SPAConfig;
    save(config: SPAConfig): void;
    clear(): void;
}

/**
 * Schedule group for selection
 */
export interface ScheduleGroup {
    id: string;
    name: string;
}

/**
 * Schedules module interface
 */
export interface SchedulesModule {
    init(classroomId: string): Promise<void>;
    loadSchedules(): Promise<void>;
    render(): void;
    currentClassroomId: string | null;
    schedules: Schedule[];
    groups: ScheduleGroup[];
    START_HOUR: string;
    END_HOUR: string;
    SLOT_MINUTES: number;
    showGroupSelectionModal(dayOfWeek: number, startTime: string, endTime: string): Promise<void>;
}

export { };
