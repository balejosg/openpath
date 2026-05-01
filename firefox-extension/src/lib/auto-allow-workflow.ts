import { fetchWithFallback, type RequestApiRuntimeConfig } from './request-api.js';

export interface AutoAllowApiResponse {
  success: boolean;
  status?: 'approved' | 'duplicate' | 'pending';
  duplicate?: boolean;
  error?: string;
}

export interface AutoAllowStateResolutionInput {
  apiSuccess: boolean;
  duplicate: boolean;
  localUpdateSuccess: boolean;
}

export interface AutoAllowWorkflowDeps {
  fetchImpl?: typeof fetch;
  getErrorMessage: (error: unknown) => string;
  getRequestApiEndpoints: (config: RequestApiRuntimeConfig) => string[];
  getStoredDomainStatus: (tabId: number, hostname: string) => DomainStatus | undefined;
  inFlightAutoRequests: Map<string, Promise<void>>;
  localWhitelistUpdateDebounceMs?: number;
  loadRequestConfig: () => Promise<RequestApiRuntimeConfig>;
  now?: () => number;
  refreshBlockedPathRules: () => Promise<boolean>;
  requestLocalWhitelistUpdate: (hostnames: string[]) => Promise<boolean>;
  sendNativeMessage: (message: unknown) => Promise<unknown>;
  setDomainStatus: (tabId: number, hostname: string, status: DomainStatus) => void;
}

interface NativeHostnameResponse {
  success: boolean;
  hostname?: string;
  error?: string;
}

interface NativeTokenResponse {
  success: boolean;
  token?: string;
  error?: string;
}

export function isAutoAllowRequestType(type?: string): boolean {
  if (!type) {
    return false;
  }

  return type !== 'main_frame' && type !== 'sub_frame';
}

export function resolveAutoAllowState(payload: AutoAllowStateResolutionInput): DomainStatusState {
  if (!payload.apiSuccess) {
    return 'apiError';
  }

  if (!payload.localUpdateSuccess) {
    return 'localUpdateError';
  }

  return payload.duplicate ? 'duplicate' : 'autoApproved';
}

function buildAutoAllowCorrelationId(
  tabId: number,
  hostname: string,
  requestType: string,
  timestamp: number
): string {
  const normalizedHost = hostname
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `auto-${tabId.toString()}-${normalizedHost}-${requestType}-${timestamp.toString()}`;
}

function hasReusableAutoAllowStatus(status: DomainStatus | undefined): boolean {
  return (
    status?.state === 'pending' || status?.state === 'autoApproved' || status?.state === 'duplicate'
  );
}

export function createAutoAllowWorkflow(deps: AutoAllowWorkflowDeps): {
  autoAllowBlockedDomain: (
    tabId: number,
    hostname: string,
    origin: string | null,
    requestType: string,
    targetUrl?: string
  ) => Promise<void>;
  retryLocalUpdate: (tabId: number, hostname: string) => Promise<{ success: boolean }>;
} {
  const now = deps.now ?? ((): number => Date.now());
  const localWhitelistUpdateDebounceMs = deps.localWhitelistUpdateDebounceMs ?? 50;
  let pendingLocalWhitelistHosts = new Set<string>();
  let pendingLocalWhitelistResolvers: ((success: boolean) => void)[] = [];
  let pendingLocalWhitelistTimer: ReturnType<typeof setTimeout> | null = null;

  async function triggerLocalWhitelistUpdate(hostname: string): Promise<boolean> {
    return await enqueueLocalWhitelistUpdate(hostname);
  }

  function flushLocalWhitelistUpdateBatch(): void {
    const hostnames = Array.from(pendingLocalWhitelistHosts);
    const resolvers = pendingLocalWhitelistResolvers;
    pendingLocalWhitelistHosts = new Set<string>();
    pendingLocalWhitelistResolvers = [];
    pendingLocalWhitelistTimer = null;

    void deps.requestLocalWhitelistUpdate(hostnames).then(
      (success) => {
        if (!success) {
          resolvers.forEach((resolve) => {
            resolve(false);
          });
          return;
        }

        void deps.refreshBlockedPathRules().then(
          (refreshSuccess) => {
            resolvers.forEach((resolve) => {
              resolve(refreshSuccess);
            });
          },
          () => {
            resolvers.forEach((resolve) => {
              resolve(false);
            });
          }
        );
      },
      () => {
        resolvers.forEach((resolve) => {
          resolve(false);
        });
      }
    );
  }

  function enqueueLocalWhitelistUpdate(hostname: string): Promise<boolean> {
    pendingLocalWhitelistHosts.add(hostname);

    const promise = new Promise<boolean>((resolve) => {
      pendingLocalWhitelistResolvers.push(resolve);
    });

    pendingLocalWhitelistTimer ??= setTimeout(
      flushLocalWhitelistUpdateBatch,
      localWhitelistUpdateDebounceMs
    );

    return promise;
  }

  async function autoAllowBlockedDomain(
    tabId: number,
    hostname: string,
    origin: string | null,
    requestType: string,
    targetUrl?: string
  ): Promise<void> {
    if (hasReusableAutoAllowStatus(deps.getStoredDomainStatus(tabId, hostname))) {
      return;
    }

    const requestKey = `${tabId.toString()}:${hostname}:${origin ?? 'unknown'}`;
    const inFlight = deps.inFlightAutoRequests.get(requestKey);
    if (inFlight) {
      await inFlight;
      return;
    }

    const requestPromise = (async (): Promise<void> => {
      deps.setDomainStatus(tabId, hostname, {
        state: 'pending',
        updatedAt: now(),
        message: 'Enviando auto-aprobacion',
        requestType,
      });

      const requestConfig = await deps.loadRequestConfig();
      const endpoints = deps.getRequestApiEndpoints(requestConfig);

      if (!requestConfig.enableRequests) {
        deps.setDomainStatus(tabId, hostname, {
          state: 'apiError',
          updatedAt: now(),
          message: 'Auto-aprobacion deshabilitada por configuracion',
          requestType,
        });
        return;
      }

      if (endpoints.length === 0) {
        deps.setDomainStatus(tabId, hostname, {
          state: 'apiError',
          updatedAt: now(),
          message: 'No hay endpoint API configurado',
          requestType,
        });
        return;
      }

      const hostnameResponse = (await deps.sendNativeMessage({
        action: 'get-hostname',
      })) as NativeHostnameResponse;
      if (!hostnameResponse.success || !hostnameResponse.hostname) {
        deps.setDomainStatus(tabId, hostname, {
          state: 'apiError',
          updatedAt: now(),
          message: hostnameResponse.error ?? 'No se pudo obtener hostname del sistema',
          requestType,
        });
        return;
      }

      const tokenResponse = (await deps.sendNativeMessage({
        action: 'get-machine-token',
      })) as NativeTokenResponse;
      if (!tokenResponse.success || !tokenResponse.token) {
        deps.setDomainStatus(tabId, hostname, {
          state: 'apiError',
          updatedAt: now(),
          message: tokenResponse.error ?? 'No se pudo obtener token de la máquina',
          requestType,
        });
        return;
      }

      const response = await fetchWithFallback(
        endpoints,
        '/api/requests/auto',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: hostname,
            origin_page: origin ?? 'desconocido',
            ...(targetUrl ? { target_url: targetUrl } : {}),
            token: tokenResponse.token,
            hostname: hostnameResponse.hostname,
            reason: `auto-allow page-resource (${requestType})`,
            diagnostic_context: {
              correlation_id: buildAutoAllowCorrelationId(tabId, hostname, requestType, now()),
              request_type: requestType,
              target_hostname: hostname,
            },
          }),
        },
        requestConfig.requestTimeout,
        deps.fetchImpl
      );

      const payload = (await response
        .json()
        .catch((): AutoAllowApiResponse => ({ success: false }))) as AutoAllowApiResponse;
      if (!response.ok || !payload.success) {
        deps.setDomainStatus(tabId, hostname, {
          state: 'apiError',
          updatedAt: now(),
          message: payload.error ?? 'Fallo de API al auto-aprobar',
          requestType,
        });
        return;
      }

      if (payload.status === 'pending') {
        deps.setDomainStatus(tabId, hostname, {
          state: 'pending',
          updatedAt: now(),
          message: 'Solicitud pendiente de aprobacion',
          requestType,
        });
        return;
      }

      const updateOk = await triggerLocalWhitelistUpdate(hostname);
      const resolvedState = resolveAutoAllowState({
        apiSuccess: true,
        duplicate: payload.status === 'duplicate' || payload.duplicate === true,
        localUpdateSuccess: updateOk,
      });
      deps.setDomainStatus(tabId, hostname, {
        state: resolvedState,
        updatedAt: now(),
        message:
          resolvedState === 'duplicate'
            ? 'Regla ya existente'
            : resolvedState === 'autoApproved'
              ? 'Auto-aprobado y actualizado'
              : 'Regla creada; fallo actualizacion local',
        requestType,
      });
    })();

    deps.inFlightAutoRequests.set(requestKey, requestPromise);

    try {
      await requestPromise;
    } catch (error) {
      deps.setDomainStatus(tabId, hostname, {
        state: 'apiError',
        updatedAt: now(),
        message: deps.getErrorMessage(error),
        requestType,
      });
    } finally {
      deps.inFlightAutoRequests.delete(requestKey);
    }
  }

  async function retryLocalUpdate(tabId: number, hostname: string): Promise<{ success: boolean }> {
    const currentStatus = deps.getStoredDomainStatus(tabId, hostname);
    const requestTypePatch = currentStatus?.requestType
      ? { requestType: currentStatus.requestType }
      : {};

    deps.setDomainStatus(tabId, hostname, {
      state: 'pending',
      updatedAt: now(),
      message: 'Reintentando actualizacion local',
      ...requestTypePatch,
    });

    const success = await triggerLocalWhitelistUpdate(hostname);
    deps.setDomainStatus(tabId, hostname, {
      state: success ? 'autoApproved' : 'localUpdateError',
      updatedAt: now(),
      message: success ? 'Actualizacion local completada' : 'Sigue fallando la actualizacion local',
      ...requestTypePatch,
    });

    return { success };
  }

  return {
    autoAllowBlockedDomain,
    retryLocalUpdate,
  };
}
