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

type BlockedDomainsMap = Record<number, Map<string, BlockedDomainData>>;

// Almacenamiento en memoria: { tabId: Map<hostname, Set<errorTypes>> }
const blockedDomains: BlockedDomainsMap = {};

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
  if (blockedDomains[tabId]) {
    blockedDomains[tabId].clear();
  }
  updateBadge(tabId);
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

interface CheckResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

/**
 * Verifica dominios usando el sistema de whitelist local
 * @param domains - Lista de dominios a verificar
 * @returns Resultado de la verificación
 */
async function checkDomainsWithNative(domains: string[]): Promise<CheckResult> {
  try {
    const response = await sendNativeMessage({
      action: 'check',
      domains: domains,
    });
    return response as CheckResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return {
      success: false,
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

    logger.info(`[Monitor] Bloqueado: ${hostname}`, { error: details.error });
    addBlockedDomain(
      details.tabId,
      hostname,
      details.error,
      details.originUrl ?? details.documentUrl
    );
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
      clearBlockedDomains(details.tabId);
    }
  }
);

/**
 * Listener: Pestaña cerrada
 * Elimina los datos de la pestaña para evitar fugas de memoria
 */
browser.tabs.onRemoved.addListener((tabId: number) => {
  if (blockedDomains[tabId]) {
    Reflect.deleteProperty(blockedDomains, tabId);
    logger.debug(`[Monitor] Tab ${tabId.toString()} cerrada, datos eliminados`);
  }
});

/**
 * Listener: Mensajes del popup
 * Responde a solicitudes de datos del popup
 */
browser.runtime.onMessage.addListener((message: unknown, _sender: Runtime.MessageSender) => {
  const handleMessage = async (): Promise<unknown> => {
    const msg = message as { action: string; tabId: number; domains?: string[] };
    switch (msg.action) {
      case 'getBlockedDomains':
        return {
          domains: getBlockedDomainsForTab(msg.tabId),
        };

      case 'clearBlockedDomains':
        clearBlockedDomains(msg.tabId);
        return { success: true };

      case 'checkWithNative':
        // Verificar dominios con Native Messaging (async)
        try {
          const domainsToCheck = (message as { domains: string[] }).domains;
          return await checkDomainsWithNative(domainsToCheck);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return {
            success: false,
            error: errorMessage,
          };
        }

      case 'isNativeAvailable':
        try {
          const available = await isNativeHostAvailable();
          return { available };
        } catch {
          return { available: false };
        }

      case 'getHostname':
        // Get system hostname via Native Messaging
        try {
          return await sendNativeMessage({ action: 'get-hostname' });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return { success: false, error: errorMessage };
        }

      case 'triggerWhitelistUpdate':
        // Trigger local whitelist update via Native Messaging
        try {
          return await sendNativeMessage({ action: 'update-whitelist' });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return { success: false, error: errorMessage };
        }

      default:
        return { error: 'Unknown action' };
    }
  };

  void handleMessage(); // Return promise for async response
  return true; // Indicates async response
});

logger.info('[Monitor de Bloqueos] Background script v2.0.0 (MV3) cargado');
