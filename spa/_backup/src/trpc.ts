import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@openpath/api';
import { getStorage } from './lib/storage.js';

function getApiUrl(): string {
    if (typeof window === 'undefined') return '';
    return getStorage().getItem('requests_api_url') ?? window.location.origin;
}

const ACCESS_TOKEN_KEY = 'openpath_access_token';
const LEGACY_TOKEN_KEY = 'requests_api_token';

function getAuthHeaders(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    const storage = getStorage();
    const token = storage.getItem(ACCESS_TOKEN_KEY) ?? storage.getItem(LEGACY_TOKEN_KEY);
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
