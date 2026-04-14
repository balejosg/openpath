import { fetchWithFallback, type RequestApiRuntimeConfig } from './request-api.js';

export interface AutoAllowApiResponse {
  success: boolean;
  status?: 'approved' | 'duplicate';
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
  inFlightAutoRequests: Set<string>;
  loadRequestConfig: () => Promise<RequestApiRuntimeConfig>;
  now?: () => number;
  refreshBlockedPathRules: () => Promise<boolean>;
  requestLocalWhitelistUpdate: () => Promise<boolean>;
  sendNativeMessage: (message: unknown) => Promise<unknown>;
  setDomainStatus: (tabId: number, hostname: string, status: DomainStatus) => void;
}

const AUTO_ALLOW_REQUEST_TYPES = new Set(['xmlhttprequest', 'fetch']);

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

  return AUTO_ALLOW_REQUEST_TYPES.has(type);
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

export function createAutoAllowWorkflow(deps: AutoAllowWorkflowDeps): {
  autoAllowBlockedDomain: (
    tabId: number,
    hostname: string,
    origin: string | null,
    requestType: string
  ) => Promise<void>;
  retryLocalUpdate: (tabId: number, hostname: string) => Promise<{ success: boolean }>;
} {
  const now = deps.now ?? ((): number => Date.now());

  async function triggerLocalWhitelistUpdate(): Promise<boolean> {
    const success = await deps.requestLocalWhitelistUpdate();
    if (success) {
      await deps.refreshBlockedPathRules();
    }

    return success;
  }

  async function autoAllowBlockedDomain(
    tabId: number,
    hostname: string,
    origin: string | null,
    requestType: string
  ): Promise<void> {
    const requestKey = `${tabId.toString()}:${hostname}:${origin ?? 'unknown'}`;
    if (deps.inFlightAutoRequests.has(requestKey)) {
      return;
    }

    deps.inFlightAutoRequests.add(requestKey);
    deps.setDomainStatus(tabId, hostname, {
      state: 'pending',
      updatedAt: now(),
      message: 'Enviando auto-aprobacion',
      requestType,
    });

    try {
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
            token: tokenResponse.token,
            hostname: hostnameResponse.hostname,
            reason: `auto-allow ajax (${requestType})`,
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

      const updateOk = await triggerLocalWhitelistUpdate();
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

    const success = await triggerLocalWhitelistUpdate();
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
