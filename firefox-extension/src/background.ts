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
import { generateProofToken } from './lib/proof-token.js';
import { getRequestApiEndpoints, loadRequestConfig } from './lib/config-storage.js';

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

interface NativeBlockedPathsResponse {
  success: boolean;
  paths?: string[];
  hash?: string;
  mtime?: number;
  source?: string;
  error?: string;
}

interface CompiledBlockedPathRule {
  rawRule: string;
  compiledPatterns: string[];
  regexes: RegExp[];
}

interface BlockedPathRulesState {
  version: string;
  rules: CompiledBlockedPathRule[];
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

interface BlockedScreenContext {
  tabId: number;
  hostname: string;
  error: string;
  origin: string | null;
}

// Almacenamiento en memoria: { tabId: Map<hostname, Set<errorTypes>> }
const blockedDomains: BlockedDomainsMap = {};
const domainStatuses: DomainStatusesMap = {};
const inFlightAutoRequests = new Set<string>();

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
const BLOCKED_SCREEN_PATH = 'blocked/blocked.html';
const BLOCKED_SCREEN_ERRORS = new Set([
  'NS_ERROR_UNKNOWN_HOST',
  'NS_ERROR_PROXY_CONNECTION_REFUSED',
]);
const PATH_BLOCKING_FILTER_TYPES: WebRequest.ResourceType[] = [
  'main_frame',
  'sub_frame',
  'xmlhttprequest',
];
const PATH_BLOCKING_REQUEST_TYPES = new Set<string>([...PATH_BLOCKING_FILTER_TYPES, 'fetch']);
const BLOCKED_PATH_REFRESH_INTERVAL_MS = 60000;
const ROUTE_BLOCK_REASON = 'BLOCKED_PATH_POLICY';
const MAX_BLOCKED_PATH_RULES = 500;
const BLOCKED_PATH_INITIAL_RETRY_DELAY_MS = 2000;
const BLOCKED_PATH_MAX_RETRIES = 3;

let blockedPathRulesState: BlockedPathRulesState = {
  version: '',
  rules: [],
};
let blockedPathRefreshTimer: ReturnType<typeof setInterval> | null = null;

function isExtensionUrl(url: string): boolean {
  return url.startsWith('moz-extension://') || url.startsWith('chrome-extension://');
}

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
    const redirectUrl = buildBlockedScreenUrl({
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

function buildBlockedScreenUrl(payload: {
  hostname: string;
  error: string;
  origin: string | null;
}): string {
  const blockedPageUrl = browser.runtime.getURL(BLOCKED_SCREEN_PATH);
  const redirectUrl = new URL(blockedPageUrl);
  redirectUrl.searchParams.set('domain', payload.hostname);
  redirectUrl.searchParams.set('error', payload.error);
  if (payload.origin) {
    redirectUrl.searchParams.set('origin', payload.origin);
  }
  return redirectUrl.toString();
}

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

function buildPathRulePatterns(rawRule: string): string[] {
  const raw = rawRule.trim().toLowerCase();
  if (raw.length === 0) {
    return [];
  }

  let clean = raw;
  for (const prefix of ['http://', 'https://', '*://']) {
    if (clean.startsWith(prefix)) {
      clean = clean.slice(prefix.length);
      break;
    }
  }

  if (!clean.includes('/') && !clean.includes('.') && !clean.includes('*')) {
    clean = `*${clean}*`;
  } else if (!clean.endsWith('*')) {
    clean = `${clean}*`;
  }

  if (clean.startsWith('*.')) {
    const base = clean.slice(2);
    return [`*://${clean}`, `*://${base}`];
  }

  if (clean.startsWith('*/')) {
    return [`*://*${clean.slice(1)}`];
  }

  if (clean.includes('.') && clean.includes('/')) {
    return [`*://*.${clean}`, `*://${clean}`];
  }

  return [`*://${clean}`];
}

function escapeRegexChar(value: string): string {
  return value.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
}

function globPatternToRegex(globPattern: string): RegExp {
  let regexSource = '^';
  const lastIndex = globPattern.length - 1;

  for (let i = 0; i < globPattern.length; i += 1) {
    if (globPattern.slice(i, i + 4) === '*://') {
      regexSource += '[a-z][a-z0-9+.-]*://';
      i += 3;
      continue;
    }

    const char = globPattern[i] ?? '';
    if (char === '*') {
      // Use non-greedy for trailing glob, segment-limited for mid-path
      regexSource += i === lastIndex ? '.*?' : '[^?#]*';
    } else {
      regexSource += escapeRegexChar(char);
    }
  }

  regexSource += '$';
  return new RegExp(regexSource, 'i');
}

function compileBlockedPathRules(paths: string[]): CompiledBlockedPathRule[] {
  const compiled: CompiledBlockedPathRule[] = [];
  const seenPatterns = new Set<string>();
  const capped = paths.slice(0, MAX_BLOCKED_PATH_RULES);

  for (const rawPath of capped) {
    const patterns = buildPathRulePatterns(rawPath).filter((pattern) => {
      if (seenPatterns.has(pattern)) {
        return false;
      }
      seenPatterns.add(pattern);
      return true;
    });

    if (patterns.length === 0) {
      continue;
    }

    compiled.push({
      rawRule: rawPath,
      compiledPatterns: patterns,
      regexes: patterns.map((pattern) => globPatternToRegex(pattern)),
    });
  }

  if (paths.length > MAX_BLOCKED_PATH_RULES) {
    logger.warn('[Monitor] Reglas de ruta truncadas', {
      provided: paths.length,
      capped: MAX_BLOCKED_PATH_RULES,
    });
  }

  return compiled;
}

function getBlockedPathRulesVersion(payload: NativeBlockedPathsResponse): string {
  if (typeof payload.hash === 'string' && payload.hash.length > 0) {
    return payload.hash;
  }
  if (typeof payload.mtime === 'number') {
    return payload.mtime.toString();
  }

  const serialized = Array.isArray(payload.paths) ? payload.paths.join('\n') : '';
  return serialized;
}

function shouldEnforcePathBlocking(type?: string): boolean {
  if (!type) {
    return false;
  }
  return PATH_BLOCKING_REQUEST_TYPES.has(type);
}

function findMatchingBlockedPathRule(
  requestUrl: string,
  rules: CompiledBlockedPathRule[] = blockedPathRulesState.rules
): CompiledBlockedPathRule | null {
  for (const rule of rules) {
    if (rule.regexes.some((regex) => regex.test(requestUrl))) {
      return rule;
    }
  }

  return null;
}

/**
 * Evalúa si una petición debe ser bloqueada por reglas de ruta.
 * Extraída como función pura para facilitar testing.
 */
function evaluatePathBlocking(
  details: { type: string; url: string; originUrl?: string; documentUrl?: string },
  rules: CompiledBlockedPathRule[] = blockedPathRulesState.rules
): { cancel?: boolean; redirectUrl?: string; reason?: string } | null {
  if (!shouldEnforcePathBlocking(details.type)) {
    return null;
  }

  if (isExtensionUrl(details.url)) {
    return null;
  }

  const matchedRule = findMatchingBlockedPathRule(details.url, rules);
  if (!matchedRule) {
    return null;
  }

  const hostname = extractHostname(details.url) ?? 'dominio desconocido';
  const origin = extractHostname(details.originUrl ?? details.documentUrl ?? '');
  const reason = `${ROUTE_BLOCK_REASON}:${matchedRule.rawRule}`;

  if (details.type === 'main_frame') {
    return {
      redirectUrl: buildBlockedScreenUrl({
        hostname,
        error: reason,
        origin,
      }),
      reason,
    };
  }

  return { cancel: true, reason };
}

async function refreshBlockedPathRules(force = false): Promise<boolean> {
  try {
    const response = (await sendNativeMessage({
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
      rules: compileBlockedPathRules(paths),
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
    if (response.success) {
      await refreshBlockedPathRules(true);
    }
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
    const requestConfig = await loadRequestConfig();
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
    const token = await generateProofToken(machineHostname, requestConfig.sharedSecret.trim());

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
    const result = evaluatePathBlocking(details);
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
  { urls: ['<all_urls>'], types: PATH_BLOCKING_FILTER_TYPES },
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
        return await sendNativeMessage({ action: 'get-hostname' });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }

    case 'triggerWhitelistUpdate':
      try {
        const response = (await sendNativeMessage({
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
