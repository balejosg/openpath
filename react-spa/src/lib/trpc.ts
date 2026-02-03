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
  return localStorage.getItem(ACCESS_TOKEN_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY);
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
      // Always use an absolute path when no API base is configured.
      // Relative URLs like "trpc" would resolve to "/current/path/trpc".
      url: (() => {
        const apiBase = getApiUrl();
        return apiBase ? `${apiBase}/trpc` : '/trpc';
      })(),
      headers: () => {
        const token = getAuthToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
      // Interceptar respuestas 401 (UNAUTHORIZED) para limpiar auth y redirigir
      fetch(url, options) {
        return fetch(url, options).then((res) => {
          if (res.status === 401) {
            // No redirigir si el error ocurre durante el login o registro
            let urlString = res.url;
            if (!urlString) {
              if (typeof url === 'string') {
                urlString = url;
              } else if (url instanceof URL) {
                urlString = url.href;
              } else if (url instanceof Request) {
                urlString = url.url;
              }
            }
            const isAuthRoute =
              urlString.includes('auth.login') || urlString.includes('auth.register');
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
