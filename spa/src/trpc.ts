import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@openpath/api';

function getApiUrl(): string {
    if (typeof window === 'undefined') return '';
    // Use the API URL from localStorage (set by setup or global-setup)
    // Falls back to window.location.origin for backward compatibility
    return localStorage.getItem('requests_api_url') ?? window.location.origin;
}

const ACCESS_TOKEN_KEY = 'openpath_access_token';
const LEGACY_TOKEN_KEY = 'requests_api_token';

function getAuthHeaders(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    // Use the correct storage key matching auth.ts
    const token = localStorage.getItem(ACCESS_TOKEN_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export const trpc = createTRPCClient<AppRouter>({
    links: [
        httpBatchLink({
            url: `${getApiUrl()}/trpc`,
            headers: getAuthHeaders,
        }),
    ],
});
