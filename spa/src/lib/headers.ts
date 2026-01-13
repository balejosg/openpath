/**
 * Authentication headers utility
 * Separated to avoid circular dependency between auth.ts and trpc.ts
 */

const ACCESS_TOKEN_KEY = 'openpath_access_token';
const LEGACY_TOKEN_KEY = 'requests_api_token';

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);

  if (!token) {
    const adminToken = localStorage.getItem(LEGACY_TOKEN_KEY);
    return {
      'Content-Type': 'application/json',
      Authorization: adminToken ? `Bearer ${adminToken}` : '',
    };
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}
