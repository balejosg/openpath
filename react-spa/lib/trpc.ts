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
 * Limpia el estado de autenticación y recarga la página.
 */
function clearAuthAndReload(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem('openpath_refresh_token');
  localStorage.removeItem('openpath_user');
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  window.location.reload();
}

/**
 * Cliente tRPC configurado.
 * Uso: await trpc.groups.list.query()
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      // Usamos ruta relativa para que funcione tanto en / como en /v2/
      // Si estamos en /v2/, esto resolverá a /v2/trpc
      url: `${getApiUrl()}${getApiUrl() ? '/trpc' : 'trpc'}`,
      headers: () => {
        const token = getAuthToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
      // Interceptar respuestas 401 (UNAUTHORIZED) para limpiar auth y redirigir
      fetch(url, options) {
        return fetch(url, options).then(async (res) => {
          if (res.status === 401) {
            // No redirigir si el error ocurre durante el login o registro
            const urlString = typeof url === 'string' ? url : (url as URL).href || url.toString();
            const isAuthRoute = urlString.includes('auth.login') || urlString.includes('auth.register');
            if (!isAuthRoute) {
              clearAuthAndReload();
            }
          }
          return res;
        });
      },
    }),
  ],
});

// Re-export tipos útiles
export type { AppRouter };
