import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { TRPCLink } from '@trpc/client';
import type { AppRouter } from '@openpath/api';
import { clearAuthAndReload, getAuthTokenForHeader } from './auth-storage';

/**
 * Obtiene la URL base de la API.
 * En desarrollo: usa el proxy de Vite (vacío = mismo origen)
 * En producción: usa la URL configurada o el origen actual
 */
function getApiUrl(): string {
  if (typeof window === 'undefined') return '';
  // Primero intentar URL guardada
  try {
    const savedUrl = localStorage.getItem('requests_api_url');
    if (savedUrl) return savedUrl;
  } catch {
    // localStorage may not be available in test environments
  }

  // Por defecto, usar mismo origen.
  // Esto mantiene compatibilidad con el proxy de Vite (misma origin) y evita
  // problemas en tests Node (fetch de undici no acepta URLs relativas).
  try {
    const origin = window.location.origin;
    if (!origin || origin === 'null') return 'http://localhost';
    return origin;
  } catch {
    return 'http://localhost';
  }
}

function resolveApiBase(apiBase: string): string {
  if (!apiBase) return apiBase;
  if (typeof window === 'undefined') return apiBase;

  // Allow relative bases like "/cp" by resolving them to an absolute origin.
  if (apiBase.startsWith('/')) {
    try {
      const origin = window.location.origin;
      if (origin && origin !== 'null') {
        return origin + apiBase;
      }
    } catch {
      // best-effort
    }
  }

  return apiBase;
}

function createDynamicHttpBatchLink(): TRPCLink<AppRouter> {
  const linkCache = new Map<string, ReturnType<typeof httpBatchLink>>();

  return (runtime) => {
    return (opts) => {
      const rawBase = getApiUrl();
      const apiBase = resolveApiBase(rawBase);
      const url = apiBase ? `${apiBase}/trpc` : '/trpc';

      let link = linkCache.get(url);
      if (!link) {
        link = httpBatchLink({
          url,
          headers: () => {
            const token = getAuthTokenForHeader();
            return token ? { Authorization: `Bearer ${token}` } : {};
          },
          // Interceptar respuestas 401 (UNAUTHORIZED) para limpiar auth y redirigir
          fetch(requestUrl, options) {
            return fetch(requestUrl, {
              ...options,
              credentials: 'include',
            }).then((res) => {
              if (res.status === 401) {
                // No redirigir si el error ocurre durante el login o registro
                let urlString = res.url;
                if (!urlString) {
                  if (typeof requestUrl === 'string') {
                    urlString = requestUrl;
                  } else if (requestUrl instanceof URL) {
                    urlString = requestUrl.href;
                  } else if (requestUrl instanceof Request) {
                    urlString = requestUrl.url;
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
        });
        linkCache.set(url, link);
      }

      return link(runtime)(opts);
    };
  };
}

/**
 * Cliente tRPC configurado.
 * Uso: await trpc.groups.list.query()
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [createDynamicHttpBatchLink()],
});

// Re-export tipos útiles
export type { AppRouter };
