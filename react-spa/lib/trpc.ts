import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@openpath/api';

// Claves de localStorage (DEBEN coincidir con spa/src/auth.ts)
const ACCESS_TOKEN_KEY = 'openpath_access_token';
const LEGACY_TOKEN_KEY = 'requests_api_token';

/**
 * Obtiene la URL base de la API.
 * En desarrollo: usa el proxy de Vite (vacío = mismo origen)
 * En producción: usa la URL configurada o el origen actual
 */
function getApiUrl(): string {
  if (typeof window === 'undefined') return '';
  // Primero intentar URL guardada
  const savedUrl = localStorage.getItem('requests_api_url');
  if (savedUrl) return savedUrl;

  // Por defecto, usar ruta relativa (proxy en dev, mismo origen en prod)
  return '';
}

/**
 * Obtiene el token de autenticación desde localStorage.
 */
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY)
    ?? localStorage.getItem(LEGACY_TOKEN_KEY);
}

/**
 * Cliente tRPC configurado.
 * Uso: await trpc.groups.list.query()
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getApiUrl()}/trpc`,
      headers: () => {
        const token = getAuthToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

// Re-export tipos útiles
export type { AppRouter };
