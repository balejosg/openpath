/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 */

/**
 * Monitor de Bloqueos de Red - Background Script
 *
 * Captura errores de red asociados a bloqueos DNS/Firewall y mantiene
 * un registro por pestaña de los dominios afectados.
 *
 * @version 2.0.0
 */

import { Browser, WebRequest, Runtime, WebNavigation } from 'webextension-polyfill';
import { logger, getErrorMessage } from './lib/logger.js';
import { getRequestApiEndpoints, loadRequestConfig } from './lib/config-storage.js';
import { buildBlockedDomainSubmitBody } from './lib/blocked-request.js';
import { createBlockedMonitorState } from './lib/blocked-monitor-state.js';
import {
  createNativeMessagingClient,
  type NativeResponse,
  type VerifyResponse,
} from './lib/native-messaging-client.js';
import {
  BLOCKED_SCREEN_PATH,
  MAX_BLOCKED_PATH_RULES,
  PATH_BLOCKING_FILTER_TYPES,
  ROUTE_BLOCK_REASON,
  buildBlockedScreenRedirectUrl,
  compileBlockedPathRules,
  evaluatePathBlocking,
  extractHostname,
  getBlockedPathRulesVersion,
  isExtensionUrl,
  type BlockedPathRulesState,
  type NativeBlockedPathsResponse,
} from './lib/path-blocking.js';
import {
  SUBMIT_BLOCKED_DOMAIN_REQUEST_ACTION,
  isSubmitBlockedDomainRequestMessage,
  shouldClearBlockedMonitorStateOnNavigate,
} from './lib/blocked-screen-contract.js';

declare const browser: Browser;

interface AutoAllowApiResponse {
  success: boolean;
  status?: 'approved' | 'duplicate';
  duplicate?: boolean;
  error?: string;
}

interface SubmitBlockedDomainApiResponse {
  success?: boolean;
  id?: string;
  status?: 'pending' | 'approved' | 'rejected';
  domain?: string;
  error?: string;
}

interface SubmitBlockedDomainResult {
  success: boolean;
  id?: string;
  status?: 'pending' | 'approved' | 'rejected';
  domain?: string;
  error?: string;
}

interface SubmitBlockedDomainInput {
  domain?: string;
  reason?: string;
  origin?: string;
  error?: string;
}

interface BlockedScreenContext {
  tabId: number;
  hostname: string;
  error: string;
  origin: string | null;
}

const inFlightAutoRequests = new Set<string>();
const blockedMonitorState = createBlockedMonitorState(
  {
    setBadgeText: (options) => browser.action.setBadgeText(options),
    setBadgeBackgroundColor: (options) => browser.action.setBadgeBackgroundColor(options),
  },
  {
    extractHostname,
    inFlightAutoRequests,
  }
);

// Nombre del host de Native Messaging
const NATIVE_HOST_NAME = 'whitelist_native_host';
const nativeMessagingClient = createNativeMessagingClient({
  hostName: NATIVE_HOST_NAME,
  logger,
});

// Errores que indican bloqueo (no ruido)
const BLOCKING_ERRORS = [
  'NS_ERROR_UNKNOWN_HOST', // Bloqueo DNS (NXDOMAIN)
  'NS_ERROR_CONNECTION_REFUSED', // Bloqueo Firewall
  'NS_ERROR_NET_TIMEOUT', // Paquetes descartados (DROP)
  'NS_ERROR_PROXY_CONNECTION_REFUSED', // Proxy bloqueado
];

// Errores a ignorar (ruido)
const IGNORED_ERRORS = [
  'NS_BINDING_ABORTED', // Usuario canceló
  'NS_ERROR_ABORT', // Navegación abortada
];

const AUTO_ALLOW_REQUEST_TYPES = new Set(['xmlhttprequest', 'fetch']);
const BLOCKED_SCREEN_ERRORS = new Set([
  'NS_ERROR_UNKNOWN_HOST',
  'NS_ERROR_PROXY_CONNECTION_REFUSED',
]);
const BLOCKED_PATH_REFRESH_INTERVAL_MS = 60000;
const BLOCKED_PATH_INITIAL_RETRY_DELAY_MS = 2000;
const BLOCKED_PATH_MAX_RETRIES = 3;

let blockedPathRulesState: BlockedPathRulesState = {
  version: '',
  rules: [],
};
let blockedPathRefreshTimer: ReturnType<typeof setInterval> | null = null;

function shouldDisplayBlockedScreen(details: WebRequest.OnErrorOccurredDetailsType): boolean {
  if (details.type !== 'main_frame') {
    return false;
  }

  if (!BLOCKED_SCREEN_ERRORS.has(details.error)) {
    return false;
  }

  if (isExtensionUrl(details.url)) {
    return false;
  }

  return true;
}

async function redirectToBlockedScreen(context: BlockedScreenContext): Promise<void> {
  try {
    const redirectUrl = buildBlockedScreenRedirectUrl({
      extensionOrigin: browser.runtime.getURL('/'),
      hostname: context.hostname,
      error: context.error,
      origin: context.origin,
    });
    await browser.tabs.update(context.tabId, { url: redirectUrl });
  } catch (error) {
    logger.error('[Monitor] No se pudo mostrar pantalla de bloqueo', {
      tabId: context.tabId,
      hostname: context.hostname,
      error: getErrorMessage(error),
    });
  }
}

async function refreshBlockedPathRules(force = false): Promise<boolean> {
  try {
    const response = (await nativeMessagingClient.sendMessage({
      action: 'get-blocked-paths',
    })) as NativeBlockedPathsResponse;
    if (!response.success) {
      logger.warn('[Monitor] No se pudieron obtener reglas de rutas', {
        error: response.error,
      });
      return false;
    }

    const version = getBlockedPathRulesVersion(response);
    if (!force && blockedPathRulesState.version === version) {
      return true;
    }

    const paths = Array.isArray(response.paths) ? response.paths : [];
    blockedPathRulesState = {
      version,
      rules: compileBlockedPathRules(paths, {
        maxRules: MAX_BLOCKED_PATH_RULES,
        onTruncated: ({ provided, capped }) => {
          logger.warn('[Monitor] Reglas de ruta truncadas', { provided, capped });
        },
      }),
    };

    logger.info('[Monitor] Reglas de rutas actualizadas', {
      count: blockedPathRulesState.rules.length,
      source: response.source,
    });
    return true;
  } catch (error) {
    logger.warn('[Monitor] Fallo al refrescar reglas de rutas', {
      error: getErrorMessage(error),
    });
    return false;
  }
}

function startBlockedPathRefreshLoop(): void {
  if (blockedPathRefreshTimer) {
    clearInterval(blockedPathRefreshTimer);
  }

  blockedPathRefreshTimer = setInterval(() => {
    void refreshBlockedPathRules(false);
  }, BLOCKED_PATH_REFRESH_INTERVAL_MS);
}

/**
 * Carga inicial de reglas con reintentos y backoff exponencial.
 * Garantiza que las reglas se carguen antes de depender de ellas.
 */
async function initBlockedPathRules(): Promise<void> {
  for (let attempt = 0; attempt < BLOCKED_PATH_MAX_RETRIES; attempt++) {
    const ok = await refreshBlockedPathRules(true);
    if (ok) {
      return;
    }
    const delay = BLOCKED_PATH_INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
    logger.warn('[Monitor] Reintentando carga de reglas de ruta', {
      attempt: attempt + 1,
      nextRetryMs: delay,
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delay);
    });
  }
  logger.error('[Monitor] No se pudieron cargar reglas de ruta tras reintentos', {
    maxRetries: BLOCKED_PATH_MAX_RETRIES,
  });
}

async function forceBlockedPathRulesRefresh(): Promise<{ success: boolean; error?: string }> {
  try {
    const success = await refreshBlockedPathRules(true);
    return success
      ? { success: true }
      : { success: false, error: 'No se pudieron refrescar las reglas de ruta' };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

const {
  addBlockedDomain,
  clearBlockedDomains,
  clearTabRuntimeState,
  disposeTab,
  domainStatuses,
  getBlockedDomainsForTab,
  getDomainStatusesForTab,
  setDomainStatus,
} = blockedMonitorState;

function isAutoAllowRequestType(type?: string): boolean {
  if (!type) return false;
  return AUTO_ALLOW_REQUEST_TYPES.has(type);
}

async function fetchWithFallback(
  endpoints: string[],
  path: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(`${endpoint}${path}`, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('No API endpoint available');
}

// ============================================================================
// Native Messaging
// ============================================================================

/**
 * Verifica dominios usando el sistema de whitelist local
 * @param domains - Lista de dominios a verificar
 * @returns Resultado de la verificación
 */
async function checkDomainsWithNative(domains: string[]): Promise<VerifyResponse> {
  return await nativeMessagingClient.checkDomains(domains);
}

/**
 * Verifica si el host de Native Messaging está disponible
 */
async function isNativeHostAvailable(): Promise<boolean> {
  return await nativeMessagingClient.isAvailable();
}

async function triggerLocalWhitelistUpdate(): Promise<boolean> {
  const success = await nativeMessagingClient.requestLocalWhitelistUpdate();
  if (success) {
    await refreshBlockedPathRules(true);
  }
  return success;
}

async function submitBlockedDomainRequest(
  input: SubmitBlockedDomainInput
): Promise<SubmitBlockedDomainResult> {
  const domain = input.domain?.trim();
  const reason = input.reason?.trim();

  if (!domain || !reason || reason.length < 3) {
    return { success: false, error: 'domain and reason are required' };
  }

  const requestConfig = await loadRequestConfig();
  const endpoints = getRequestApiEndpoints(requestConfig);
  if (!requestConfig.enableRequests || endpoints.length === 0) {
    return {
      success: false,
      error: 'Configuracion incompleta para solicitar dominios',
    };
  }

  const hostnameResponse = (await nativeMessagingClient.sendMessage({
    action: 'get-hostname',
  })) as {
    success: boolean;
    hostname?: string;
    error?: string;
  };
  if (!hostnameResponse.success || !hostnameResponse.hostname) {
    return {
      success: false,
      error: hostnameResponse.error ?? 'No se pudo obtener el hostname del equipo',
    };
  }

  const tokenResponse = (await nativeMessagingClient.sendMessage({
    action: 'get-machine-token',
  })) as {
    success: boolean;
    token?: string;
    error?: string;
  };
  if (!tokenResponse.success || !tokenResponse.token) {
    return {
      success: false,
      error: tokenResponse.error ?? 'No se pudo obtener token de la maquina',
    };
  }

  const requestBody = buildBlockedDomainSubmitBody({
    domain,
    reason,
    token: tokenResponse.token,
    hostname: hostnameResponse.hostname,
    clientVersion: browser.runtime.getManifest().version,
    origin: input.origin,
    error: input.error,
  });

  const response = await fetchWithFallback(
    endpoints,
    '/api/requests/submit',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    },
    requestConfig.requestTimeout
  );

  const payload = (await response
    .json()
    .catch((): SubmitBlockedDomainApiResponse => ({}))) as SubmitBlockedDomainApiResponse;

  if (!response.ok || payload.success !== true) {
    return {
      success: false,
      error: payload.error ?? `No se pudo enviar la solicitud (${response.status.toString()})`,
    };
  }

  const result: SubmitBlockedDomainResult = { success: true };
  if (payload.id) {
    result.id = payload.id;
  }
  if (payload.status) {
    result.status = payload.status;
  }
  if (payload.domain) {
    result.domain = payload.domain;
  }
  return result;
}

async function autoAllowBlockedDomain(
  tabId: number,
  hostname: string,
  origin: string | null,
  requestType: string
): Promise<void> {
  const requestKey = `${tabId.toString()}:${hostname}:${origin ?? 'unknown'}`;
  if (inFlightAutoRequests.has(requestKey)) {
    return;
  }

  inFlightAutoRequests.add(requestKey);
  setDomainStatus(tabId, hostname, {
    state: 'pending',
    updatedAt: Date.now(),
    message: 'Enviando auto-aprobacion',
    requestType,
  });

  try {
    const requestConfig = await loadRequestConfig();
    const endpoints = getRequestApiEndpoints(requestConfig);

    if (!requestConfig.enableRequests) {
      setDomainStatus(tabId, hostname, {
        state: 'apiError',
        updatedAt: Date.now(),
        message: 'Auto-aprobacion deshabilitada por configuracion',
        requestType,
      });
      return;
    }

    if (endpoints.length === 0) {
      setDomainStatus(tabId, hostname, {
        state: 'apiError',
        updatedAt: Date.now(),
        message: 'No hay endpoint API configurado',
        requestType,
      });
      return;
    }

    const hostnameResponse = (await nativeMessagingClient.sendMessage({
      action: 'get-hostname',
    })) as {
      success: boolean;
      hostname?: string;
      error?: string;
    };

    if (!hostnameResponse.success || !hostnameResponse.hostname) {
      setDomainStatus(tabId, hostname, {
        state: 'apiError',
        updatedAt: Date.now(),
        message: hostnameResponse.error ?? 'No se pudo obtener hostname del sistema',
        requestType,
      });
      return;
    }

    const machineHostname = hostnameResponse.hostname;
    const tokenResponse = (await nativeMessagingClient.sendMessage({
      action: 'get-machine-token',
    })) as {
      success: boolean;
      token?: string;
      error?: string;
    };
    if (!tokenResponse.success || !tokenResponse.token) {
      setDomainStatus(tabId, hostname, {
        state: 'apiError',
        updatedAt: Date.now(),
        message: tokenResponse.error ?? 'No se pudo obtener token de la máquina',
        requestType,
      });
      return;
    }

    const token = tokenResponse.token;

    const reason = `auto-allow ajax (${requestType})`;
    const response = await fetchWithFallback(
      endpoints,
      '/api/requests/auto',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: hostname,
          origin_page: origin ?? 'desconocido',
          token,
          hostname: machineHostname,
          reason,
        }),
      },
      requestConfig.requestTimeout
    );

    const payload = (await response.json()) as AutoAllowApiResponse;
    if (!response.ok || !payload.success) {
      setDomainStatus(tabId, hostname, {
        state: 'apiError',
        updatedAt: Date.now(),
        message: payload.error ?? 'Fallo de API al auto-aprobar',
        requestType,
      });
      return;
    }

    const updateOk = await triggerLocalWhitelistUpdate();
    if (!updateOk) {
      setDomainStatus(tabId, hostname, {
        state: 'localUpdateError',
        updatedAt: Date.now(),
        message: 'Regla creada; fallo actualizacion local',
        requestType,
      });
      return;
    }

    const isDuplicate = payload.status === 'duplicate' || payload.duplicate === true;
    setDomainStatus(tabId, hostname, {
      state: isDuplicate ? 'duplicate' : 'autoApproved',
      updatedAt: Date.now(),
      message: isDuplicate ? 'Regla ya existente' : 'Auto-aprobado y actualizado',
      requestType,
    });
  } catch (error) {
    setDomainStatus(tabId, hostname, {
      state: 'apiError',
      updatedAt: Date.now(),
      message: getErrorMessage(error),
      requestType,
    });
  } finally {
    inFlightAutoRequests.delete(requestKey);
  }
}

async function retryLocalUpdate(tabId: number, hostname: string): Promise<{ success: boolean }> {
  const currentStatus = domainStatuses[tabId]?.get(hostname);
  const requestTypePatch = currentStatus?.requestType
    ? { requestType: currentStatus.requestType }
    : {};
  setDomainStatus(tabId, hostname, {
    state: 'pending',
    updatedAt: Date.now(),
    message: 'Reintentando actualizacion local',
    ...requestTypePatch,
  });

  const success = await triggerLocalWhitelistUpdate();
  if (success) {
    setDomainStatus(tabId, hostname, {
      state: 'autoApproved',
      updatedAt: Date.now(),
      message: 'Actualizacion local completada',
      ...requestTypePatch,
    });
  } else {
    setDomainStatus(tabId, hostname, {
      state: 'localUpdateError',
      updatedAt: Date.now(),
      message: 'Sigue fallando la actualizacion local',
      ...requestTypePatch,
    });
  }

  return { success };
}

// ============================================================================
// Event Listeners
// ============================================================================

browser.webRequest.onBeforeRequest.addListener(
  (details: WebRequest.OnBeforeRequestDetailsType) => {
    const result = evaluatePathBlocking(details, blockedPathRulesState.rules, {
      extensionOrigin: browser.runtime.getURL('/'),
    });
    if (!result) {
      return;
    }

    const hostname = extractHostname(details.url) ?? 'dominio desconocido';
    if (details.tabId >= 0) {
      const reason = result.reason ?? `${ROUTE_BLOCK_REASON}:unknown`;
      addBlockedDomain(details.tabId, hostname, reason, details.originUrl ?? details.documentUrl);
    }

    if (result.redirectUrl) {
      return { redirectUrl: result.redirectUrl };
    }

    return { cancel: true };
  },
  { urls: ['<all_urls>'], types: [...PATH_BLOCKING_FILTER_TYPES] as WebRequest.ResourceType[] },
  ['blocking']
);

/**
 * Listener: Errores de red
 * Captura peticiones que fallan con errores de bloqueo
 */
browser.webRequest.onErrorOccurred.addListener(
  (details: WebRequest.OnErrorOccurredDetailsType) => {
    // Ignorar errores de ruido
    if (IGNORED_ERRORS.includes(details.error)) {
      return;
    }

    // Solo procesar errores de bloqueo
    if (!BLOCKING_ERRORS.includes(details.error)) {
      return;
    }

    // Extraer hostname
    const hostname = extractHostname(details.url);
    if (!hostname) {
      return;
    }

    // Ignorar peticiones sin tab (background requests)
    if (details.tabId < 0) {
      return;
    }

    const origin = extractHostname(details.originUrl ?? details.documentUrl ?? '');

    logger.info(`[Monitor] Bloqueado: ${hostname}`, {
      error: details.error,
      requestType: details.type,
    });
    addBlockedDomain(
      details.tabId,
      hostname,
      details.error,
      details.originUrl ?? details.documentUrl
    );

    if (shouldDisplayBlockedScreen(details)) {
      void redirectToBlockedScreen({
        tabId: details.tabId,
        hostname,
        error: details.error,
        origin,
      });
    }

    if (isAutoAllowRequestType(details.type)) {
      void autoAllowBlockedDomain(details.tabId, hostname, origin, details.type);
    }
  },
  { urls: ['<all_urls>'] }
);

/**
 * Listener: Navegación iniciada
 * Limpia la lista de bloqueos cuando el usuario navega a una nueva página
 */
browser.webNavigation.onBeforeNavigate.addListener(
  (details: WebNavigation.OnBeforeNavigateDetailsType) => {
    if (
      shouldClearBlockedMonitorStateOnNavigate(
        { frameId: details.frameId, url: details.url },
        browser.runtime.getURL(BLOCKED_SCREEN_PATH)
      )
    ) {
      logger.debug(`[Monitor] Limpiando bloqueos para tab ${details.tabId.toString()}`);
      clearTabRuntimeState(details.tabId);
    }
  }
);

/**
 * Listener: Pestaña cerrada
 * Elimina los datos de la pestaña para evitar fugas de memoria
 */
browser.tabs.onRemoved.addListener((tabId: number) => {
  disposeTab(tabId);
  logger.debug(`[Monitor] Tab ${tabId.toString()} cerrada, datos eliminados`);
});

/**
 * Listener: Mensajes del popup
 * Responde a solicitudes de datos del popup
 */
browser.runtime.onMessage.addListener(async (message: unknown, _sender: Runtime.MessageSender) => {
  const msg = message as {
    action: string;
    tabId: number;
    domains?: string[];
    hostname?: string;
    domain?: string;
    reason?: string;
    origin?: string;
    error?: string;
  };

  switch (msg.action) {
    case 'getBlockedDomains':
      return {
        domains: getBlockedDomainsForTab(msg.tabId),
      };

    case 'getDomainStatuses':
      return {
        statuses: getDomainStatusesForTab(msg.tabId),
      };

    case 'getBlockedPathRulesDebug':
      return {
        success: true,
        version: blockedPathRulesState.version,
        count: blockedPathRulesState.rules.length,
        rawRules: blockedPathRulesState.rules.map((rule) => rule.rawRule),
        compiledPatterns: blockedPathRulesState.rules.flatMap((rule) => rule.compiledPatterns),
      };

    case 'getNativeBlockedPathsDebug':
      try {
        return (await nativeMessagingClient.sendMessage({
          action: 'get-blocked-paths',
        })) as NativeBlockedPathsResponse;
      } catch (error) {
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }

    case 'evaluateBlockedPathDebug': {
      const targetUrl = (msg as { url?: string }).url ?? '';
      const targetType = (msg as { type?: string }).type ?? '';
      return {
        success: true,
        outcome: evaluatePathBlocking(
          { type: targetType, url: targetUrl },
          blockedPathRulesState.rules,
          { extensionOrigin: browser.runtime.getURL('/') }
        ),
      };
    }

    case 'clearBlockedDomains':
      clearBlockedDomains(msg.tabId);
      return { success: true };

    case 'checkWithNative':
    case 'verifyDomains':
      try {
        const domainsToCheck = Array.isArray(msg.domains) ? msg.domains : [];
        return await checkDomainsWithNative(domainsToCheck);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          success: false,
          results: [],
          error: errorMessage,
        };
      }

    case 'isNativeAvailable':
    case 'checkNative':
      try {
        const available = await isNativeHostAvailable();
        return { available, success: available };
      } catch {
        return { available: false, success: false };
      }

    case 'getHostname':
      try {
        return await nativeMessagingClient.sendMessage({ action: 'get-hostname' });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }

    case 'getMachineToken':
      try {
        return await nativeMessagingClient.sendMessage({ action: 'get-machine-token' });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }

    case SUBMIT_BLOCKED_DOMAIN_REQUEST_ACTION:
      try {
        if (!isSubmitBlockedDomainRequestMessage(message)) {
          return { success: false, error: 'domain and reason are required' };
        }

        const input: SubmitBlockedDomainInput = {};
        if (msg.domain !== undefined) {
          input.domain = msg.domain;
        }
        if (msg.reason !== undefined) {
          input.reason = msg.reason;
        }
        if (msg.origin !== undefined) {
          input.origin = msg.origin;
        }
        if (msg.error !== undefined) {
          input.error = msg.error;
        }
        return await submitBlockedDomainRequest(input);
      } catch (error) {
        return { success: false, error: getErrorMessage(error) };
      }

    case 'triggerWhitelistUpdate':
      try {
        const response = (await nativeMessagingClient.sendMessage({
          action: 'update-whitelist',
        })) as NativeResponse;
        if (response.success) {
          await refreshBlockedPathRules(true);
        }
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }

    case 'refreshBlockedPathRules':
      return forceBlockedPathRulesRefresh();

    case 'retryLocalUpdate':
      if (!msg.hostname) {
        return { success: false, error: 'hostname is required' };
      }
      return retryLocalUpdate(msg.tabId, msg.hostname);

    default:
      return { error: 'Unknown action' };
  }
});

void initBlockedPathRules().then(() => {
  startBlockedPathRefreshLoop();
});

logger.info('[Monitor de Bloqueos] Background script v2.0.0 (MV3) cargado');
