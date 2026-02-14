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

declare const browser: Browser;

interface BlockedDomainData {
  errors: Set<string>;
  origin: string | null;
  timestamp: number;
}

interface NativeResponse {
  success: boolean;
  [key: string]: unknown;
}

interface NativeCheckResult {
  domain: string;
  in_whitelist: boolean;
  resolved_ip?: string;
  error?: string;
}

interface NativeCheckResponse {
  success: boolean;
  results?: NativeCheckResult[];
  error?: string;
}

interface VerifyResult {
  domain: string;
  inWhitelist: boolean;
  resolvedIp?: string;
  error?: string;
}

interface VerifyResponse {
  success: boolean;
  results: VerifyResult[];
  error?: string;
}

interface RuntimeRequestConfig {
  requestApiUrl: string;
  fallbackApiUrls: string[];
  requestTimeout: number;
  enableRequests: boolean;
  sharedSecret: string;
  debugMode: boolean;
}

interface AutoAllowApiResponse {
  success: boolean;
  status?: 'approved' | 'duplicate';
  duplicate?: boolean;
  error?: string;
}

interface DomainStatusPayload extends DomainStatus {
  hostname: string;
}

type BlockedDomainsMap = Record<number, Map<string, BlockedDomainData>>;
type DomainStatusesMap = Record<number, Map<string, DomainStatus>>;

// Almacenamiento en memoria: { tabId: Map<hostname, Set<errorTypes>> }
const blockedDomains: BlockedDomainsMap = {};
const domainStatuses: DomainStatusesMap = {};
const inFlightAutoRequests = new Set<string>();

const DEFAULT_REQUEST_CONFIG: RuntimeRequestConfig = {
  requestApiUrl: '',
  fallbackApiUrls: [],
  requestTimeout: 10000,
  enableRequests: true,
  sharedSecret: '',
  debugMode: false,
};

// Estado de Native Messaging

let nativePort: Runtime.Port | null = null;

// Nombre del host de Native Messaging
const NATIVE_HOST_NAME = 'whitelist_native_host';

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

/**
 * Extrae el hostname de una URL
 * @param url - URL completa
 * @returns Hostname o null si inválido
 */
function extractHostname(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

/**
 * Inicializa el almacenamiento para una pestaña si no existe
 * @param tabId - ID de la pestaña
 */
function ensureTabStorage(tabId: number): void {
  blockedDomains[tabId] ??= new Map();
}

function ensureStatusStorage(tabId: number): void {
  domainStatuses[tabId] ??= new Map();
}

function setDomainStatus(tabId: number, hostname: string, status: DomainStatus): void {
  ensureStatusStorage(tabId);
  domainStatuses[tabId]?.set(hostname, status);
}

function getDomainStatusesForTab(tabId: number): Record<string, DomainStatusPayload> {
  const result: Record<string, DomainStatusPayload> = {};
  const tabStatuses = domainStatuses[tabId];
  if (!tabStatuses) {
    return result;
  }

  tabStatuses.forEach((status, hostname) => {
    result[hostname] = {
      hostname,
      ...status,
    };
  });

  return result;
}

function clearTabRuntimeState(tabId: number): void {
  if (blockedDomains[tabId]) {
    blockedDomains[tabId].clear();
  }
  if (domainStatuses[tabId]) {
    domainStatuses[tabId].clear();
  }
  const prefix = `${tabId.toString()}:`;
  Array.from(inFlightAutoRequests).forEach((key) => {
    if (key.startsWith(prefix)) {
      inFlightAutoRequests.delete(key);
    }
  });
  updateBadge(tabId);
}

function isAutoAllowRequestType(type?: string): boolean {
  if (!type) return false;
  return AUTO_ALLOW_REQUEST_TYPES.has(type);
}

async function loadRuntimeConfig(): Promise<RuntimeRequestConfig> {
  try {
    const stored = await browser.storage.sync.get('config');
    const incoming = stored.config as Partial<RuntimeRequestConfig> | undefined;
    return {
      ...DEFAULT_REQUEST_CONFIG,
      ...(incoming ?? {}),
    };
  } catch {
    return { ...DEFAULT_REQUEST_CONFIG };
  }
}

function getRequestApiEndpoints(config: RuntimeRequestConfig): string[] {
  return [config.requestApiUrl, ...config.fallbackApiUrls].filter((url) => url.length > 0);
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

async function generateToken(hostname: string, secret: string): Promise<string> {
  const data = new TextEncoder().encode(hostname + secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return btoa(String.fromCharCode(...hashArray));
}

/**
 * Añade un dominio bloqueado al registro
 * @param tabId - ID de la pestaña
 * @param hostname - Dominio bloqueado
 * @param error - Tipo de error
 * @param originUrl - URL de la página que cargaba el recurso
 */
function addBlockedDomain(
  tabId: number,
  hostname: string,
  error: string,
  originUrl?: string
): void {
  ensureTabStorage(tabId);

  const originHostname = originUrl ? extractHostname(originUrl) : null;

  if (!blockedDomains[tabId]?.has(hostname)) {
    blockedDomains[tabId]?.set(hostname, {
      errors: new Set(),
      origin: originHostname,
      timestamp: Date.now(),
    });

    setDomainStatus(tabId, hostname, {
      state: 'detected',
      updatedAt: Date.now(),
      message: 'Bloqueo detectado',
    });
  }
  blockedDomains[tabId]?.get(hostname)?.errors.add(error);

  updateBadge(tabId);
}

/**
 * Actualiza el badge (contador) del icono de la extensión
 * @param tabId - ID de la pestaña
 */
function updateBadge(tabId: number): void {
  const count = blockedDomains[tabId] ? blockedDomains[tabId].size : 0;

  void browser.action.setBadgeText({
    text: count > 0 ? count.toString() : '',
    tabId: tabId,
  });

  void browser.action.setBadgeBackgroundColor({
    color: '#FF0000',
    tabId: tabId,
  });
}

/**
 * Limpia los dominios bloqueados para una pestaña
 * @param tabId - ID de la pestaña
 */
function clearBlockedDomains(tabId: number): void {
  clearTabRuntimeState(tabId);
}

interface SerializedBlockedDomain {
  errors: string[];
  origin: string | null;
  timestamp: number;
}

/**
 * Obtiene los dominios bloqueados para una pestaña
 * @param tabId - ID de la pestaña
 * @returns Objeto con dominios, errores y origen
 */
function getBlockedDomainsForTab(tabId: number): Record<string, SerializedBlockedDomain> {
  const result: Record<string, SerializedBlockedDomain> = {};

  if (blockedDomains[tabId]) {
    blockedDomains[tabId].forEach((data, hostname) => {
      result[hostname] = {
        errors: Array.from(data.errors),
        origin: data.origin,
        timestamp: data.timestamp,
      };
    });
  }

  return result;
}

// ============================================================================
// Native Messaging
// ============================================================================

/**
 * Conecta con el host de Native Messaging
 * @returns true si la conexión fue exitosa
 */
async function connectNativeHost(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      nativePort = browser.runtime.connectNative(NATIVE_HOST_NAME);

      nativePort.onDisconnect.addListener((_port: Runtime.Port) => {
        logger.info('[Monitor] Native host desconectado', { lastError: browser.runtime.lastError });

        nativePort = null;
      });

      logger.info('[Monitor] Native host conectado');
      resolve(true);
    } catch (error) {
      logger.error('[Monitor] Error conectando Native host', { error: getErrorMessage(error) });

      resolve(false);
    }
  });
}

/**
 * Envía un mensaje al host de Native Messaging y espera respuesta
 * @param message - Mensaje a enviar
 * @returns Respuesta del host
 */
async function sendNativeMessage(message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const attempt = async (): Promise<void> => {
      try {
        // Intentar conectar si no está conectado
        if (!nativePort) {
          const connected = await connectNativeHost();
          if (!connected) {
            reject(new Error('No se pudo conectar con el host nativo'));
            return;
          }
        }

        // Usar sendNativeMessage para comunicación simple
        const response = await browser.runtime.sendNativeMessage(
          NATIVE_HOST_NAME,
          message as object
        );

        resolve(response);
      } catch (error) {
        logger.error('[Monitor] Error en Native Messaging', { error: getErrorMessage(error) });
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    void attempt();
  });
}

/**
 * Verifica dominios usando el sistema de whitelist local
 * @param domains - Lista de dominios a verificar
 * @returns Resultado de la verificación
 */
async function checkDomainsWithNative(domains: string[]): Promise<VerifyResponse> {
  try {
    const response = await sendNativeMessage({
      action: 'check',
      domains: domains,
    });

    const nativeResponse = response as NativeCheckResponse;
    const mappedResults: VerifyResult[] = (nativeResponse.results ?? []).map((result) => {
      const mapped: VerifyResult = {
        domain: result.domain,
        inWhitelist: result.in_whitelist,
      };

      if (result.resolved_ip !== undefined) {
        mapped.resolvedIp = result.resolved_ip;
      }

      if (result.error !== undefined) {
        mapped.error = result.error;
      }

      return mapped;
    });

    const verifyResponse: VerifyResponse = {
      success: nativeResponse.success,
      results: mappedResults,
    };

    if (nativeResponse.error !== undefined) {
      verifyResponse.error = nativeResponse.error;
    }

    return verifyResponse;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return {
      success: false,
      results: [],
      error: errorMessage,
    };
  }
}

/**
 * Verifica si el host de Native Messaging está disponible
 */
async function isNativeHostAvailable(): Promise<boolean> {
  try {
    const response = (await sendNativeMessage({ action: 'ping' })) as NativeResponse;
    return response.success;
  } catch {
    return false;
  }
}

async function triggerLocalWhitelistUpdate(): Promise<boolean> {
  try {
    const response = (await sendNativeMessage({ action: 'update-whitelist' })) as NativeResponse;
    return response.success;
  } catch {
    return false;
  }
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
    const requestConfig = await loadRuntimeConfig();
    const endpoints = getRequestApiEndpoints(requestConfig);

    if (!requestConfig.enableRequests || requestConfig.sharedSecret.trim().length === 0) {
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

    const hostnameResponse = (await sendNativeMessage({ action: 'get-hostname' })) as {
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
    const token = await generateToken(machineHostname, requestConfig.sharedSecret);

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
    // Solo limpiar para navegación principal (no iframes)
    if (details.frameId === 0) {
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
  clearTabRuntimeState(tabId);
  Reflect.deleteProperty(blockedDomains, tabId);
  Reflect.deleteProperty(domainStatuses, tabId);
  logger.debug(`[Monitor] Tab ${tabId.toString()} cerrada, datos eliminados`);
});

/**
 * Listener: Mensajes del popup
 * Responde a solicitudes de datos del popup
 */
browser.runtime.onMessage.addListener(async (message: unknown, _sender: Runtime.MessageSender) => {
  const msg = message as { action: string; tabId: number; domains?: string[]; hostname?: string };

  switch (msg.action) {
    case 'getBlockedDomains':
      return {
        domains: getBlockedDomainsForTab(msg.tabId),
      };

    case 'getDomainStatuses':
      return {
        statuses: getDomainStatusesForTab(msg.tabId),
      };

    case 'clearBlockedDomains':
      clearBlockedDomains(msg.tabId);
      return { success: true };

    case 'checkWithNative':
    case 'verifyDomains':
      try {
        const domainsToCheck = msg.domains ?? [];
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
        return await sendNativeMessage({ action: 'get-hostname' });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }

    case 'triggerWhitelistUpdate':
      try {
        return await sendNativeMessage({ action: 'update-whitelist' });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }

    case 'retryLocalUpdate':
      if (!msg.hostname) {
        return { success: false, error: 'hostname is required' };
      }
      return retryLocalUpdate(msg.tabId, msg.hostname);

    default:
      return { error: 'Unknown action' };
  }
});

logger.info('[Monitor de Bloqueos] Background script v2.0.0 (MV3) cargado');
