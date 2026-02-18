/**
 * OpenPath Firefox Extension - Popup Script
 * Handles the popup UI and communication with background script
 */

import { logger, getErrorMessage } from './lib/logger.js';

interface BlockedDomainInfo {
  count?: number;
  errors?: string[];
  timestamp: number;
  origin?: string | null;
}

interface SerializedBlockedDomain {
  errors: string[];
  origin: string | null;
  timestamp: number;
}

type BlockedDomainsData = Record<string, BlockedDomainInfo>;

interface VerifyResult {
  domain: string;
  inWhitelist: boolean;
  resolvedIp?: string;
  in_whitelist?: boolean;
  resolved_ip?: string;
  error?: string;
}

interface VerifyResponse {
  success: boolean;
  results: VerifyResult[];
  error?: string;
}

interface SubmitRequestResult {
  success: boolean;
  id: string;
  domain: string;
  status: 'pending' | 'approved' | 'rejected';
  groupId: string;
  source: string;
  error?: string;
}

interface BlockedDomainsResponse {
  domains?: Record<string, SerializedBlockedDomain>;
}

interface DomainStatusesResponse {
  statuses?: Record<string, DomainStatus>;
}

/**
 * Helper to get DOM elements safely
 * @param id Element ID
 * @returns The element
 * @throws Error if element not found
 */
function getElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Required element #${id} not found`);
  return el;
}

// DOM Elements
const tabDomainEl = getElement('tab-domain');
const countEl = getElement('count');
const domainsListEl = getElement('domains-list');
const emptyMessageEl = getElement('empty-message');
const btnCopy = getElement('btn-copy') as HTMLButtonElement;
const btnVerify = getElement('btn-verify') as HTMLButtonElement;
const btnClear = getElement('btn-clear') as HTMLButtonElement;
const btnRequest = getElement('btn-request') as HTMLButtonElement;
const toastEl = getElement('toast');
const nativeStatusEl = getElement('native-status');
const verifyResultsEl = getElement('verify-results');
const verifyListEl = getElement('verify-list');

// Request form elements
const requestSectionEl = getElement('request-section');
const requestDomainSelectEl = getElement('request-domain-select') as HTMLSelectElement;
const requestReasonEl = getElement('request-reason') as HTMLInputElement;
const btnSubmitRequest = getElement('btn-submit-request') as HTMLButtonElement;
const requestStatusEl = getElement('request-status');

// Current tab ID
let currentTabId: number | null = null;

// Current blocked domains data
let blockedDomainsData: BlockedDomainsData = {};

// Native Messaging availability
let isNativeAvailable = false;
let isRequestApiAvailable = false;
let domainStatusesData: Record<string, DomainStatus> = {};

/**
 * Show a temporary toast message
 * @param message Message to show
 * @param duration Duration in ms
 */
function showToast(message: string, duration = 3000): void {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

/**
 * Extract hostname from URL
 * @param url Full URL
 * @returns Hostname
 */
function extractTabHostname(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return 'desconocido';
  }
}

function normalizeBlockedDomains(response: unknown): BlockedDomainsData {
  const payload = response as BlockedDomainsResponse;
  const serializedDomains = payload.domains ?? {};
  const normalized: BlockedDomainsData = {};

  Object.entries(serializedDomains).forEach(([hostname, data]) => {
    const normalizedEntry: BlockedDomainInfo = {
      count: data.errors.length,
      timestamp: data.timestamp,
    };

    if (data.origin !== null) {
      normalizedEntry.origin = data.origin;
    }

    normalized[hostname] = normalizedEntry;
  });

  return normalized;
}

function normalizeDomainStatuses(response: unknown): Record<string, DomainStatus> {
  const payload = response as DomainStatusesResponse;
  return payload.statuses ?? {};
}

function getRequestApiEndpoints(): string[] {
  if (window.getAllApiUrls) {
    return window.getAllApiUrls().filter((url) => typeof url === 'string' && url.length > 0);
  }

  return [CONFIG.requestApiUrl, ...CONFIG.fallbackApiUrls].filter((url) => url.length > 0);
}

function isRequestConfigured(): boolean {
  if (window.hasValidRequestConfig) {
    return window.hasValidRequestConfig();
  }
  return (
    CONFIG.enableRequests &&
    CONFIG.sharedSecret.trim().length > 0 &&
    getRequestApiEndpoints().length > 0
  );
}

async function fetchWithFallback(
  path: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const endpoints = getRequestApiEndpoints();
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

  throw lastError ?? new Error('No hay endpoint API disponible');
}

async function generateProofToken(hostname: string, secret: string): Promise<string> {
  const data = new TextEncoder().encode(hostname + secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return btoa(String.fromCharCode(...hashArray));
}

function statusMeta(status?: DomainStatus): {
  label: string;
  className: string;
  retryable: boolean;
} {
  switch (status?.state) {
    case 'pending':
      return { label: 'Pendiente', className: 'status-pending', retryable: false };
    case 'autoApproved':
      return { label: 'Auto-aprobado', className: 'status-approved', retryable: false };
    case 'duplicate':
      return { label: 'Duplicado', className: 'status-duplicate', retryable: false };
    case 'localUpdateError':
      return { label: 'Error update local', className: 'status-update-error', retryable: true };
    case 'apiError':
      return { label: 'Error API', className: 'status-api-error', retryable: false };
    default:
      return { label: 'Detectado', className: 'status-detected', retryable: false };
  }
}

function refreshRequestButtonState(): void {
  const hasDomains = Object.keys(blockedDomainsData).length > 0;
  const canRequest =
    hasDomains && isNativeAvailable && isRequestApiAvailable && isRequestConfigured();

  if (canRequest) {
    btnRequest.classList.remove('hidden');
    btnRequest.disabled = false;
  } else {
    btnRequest.classList.add('hidden');
    btnRequest.disabled = true;
    hideRequestSection();
  }
}

/**
 * Load blocked domains for the current tab
 */
async function loadBlockedDomains(): Promise<void> {
  if (currentTabId === null) return;

  try {
    const response = await browser.runtime.sendMessage({
      action: 'getBlockedDomains',
      tabId: currentTabId,
    });

    blockedDomainsData = normalizeBlockedDomains(response);
    await loadDomainStatuses();
    renderDomainsList();
  } catch (error) {
    logger.error('[Popup] Error loading blocked domains', { error: getErrorMessage(error) });
    blockedDomainsData = {};
    domainStatusesData = {};
    renderDomainsList();
  }
}

async function loadDomainStatuses(): Promise<void> {
  if (currentTabId === null) return;

  try {
    const response = await browser.runtime.sendMessage({
      action: 'getDomainStatuses',
      tabId: currentTabId,
    });
    domainStatusesData = normalizeDomainStatuses(response);
  } catch {
    domainStatusesData = {};
  }
}

/**
 * Render the list of blocked domains in the UI
 */
function renderDomainsList(): void {
  const hostnames = Object.keys(blockedDomainsData).sort();

  if (hostnames.length === 0) {
    countEl.textContent = '0';
    domainsListEl.classList.add('hidden');
    emptyMessageEl.classList.remove('hidden');
    btnCopy.disabled = true;
    btnVerify.disabled = true;
    btnRequest.disabled = true;
    refreshRequestButtonState();
    return;
  }

  countEl.textContent = hostnames.length.toString();
  domainsListEl.classList.remove('hidden');
  emptyMessageEl.classList.add('hidden');
  btnCopy.disabled = false;
  btnVerify.disabled = !isNativeAvailable;
  refreshRequestButtonState();

  domainsListEl.innerHTML = '';
  hostnames.forEach((hostname) => {
    const info = blockedDomainsData[hostname];
    if (!info) return;
    const attempts = info.count ?? info.errors?.length ?? 1;

    const item = document.createElement('li');
    item.className = 'domain-item';
    const status = domainStatusesData[hostname];
    const meta = statusMeta(status);
    const retryButton =
      meta.retryable && currentTabId !== null
        ? `<button class="retry-update-btn" data-hostname="${hostname}" title="Reintentar actualización local">Reintentar</button>`
        : '';

    item.innerHTML = `
            <span class="domain-name" title="${hostname}">${hostname}</span>
            <span class="domain-meta">
                <span class="domain-count" title="Intentos de conexión">${attempts.toString()}</span>
                <span class="domain-status ${meta.className}" title="${meta.label}">${meta.label}</span>
                ${retryButton}
            </span>
        `;
    domainsListEl.appendChild(item);
  });
}

/**
 * Copy blocked domains list to clipboard
 */
async function copyToClipboard(): Promise<void> {
  const hostnames = Object.keys(blockedDomainsData).sort();
  if (hostnames.length === 0) return;

  const text = hostnames.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copiado al portapapeles');
  } catch (error) {
    logger.error('[Popup] Error copying to clipboard', { error: getErrorMessage(error) });
    showToast('Error al copiar');
  }
}

/**
 * Clear blocked domains for current tab
 */
async function clearDomains(): Promise<void> {
  if (currentTabId === null) return;

  try {
    await browser.runtime.sendMessage({
      action: 'clearBlockedDomains',
      tabId: currentTabId,
    });
    blockedDomainsData = {};
    domainStatusesData = {};
    renderDomainsList();
    hideVerifyResults();
    hideRequestSection();
    showToast('Lista limpiada');
  } catch (error) {
    logger.error('[Popup] Error clearing domains', { error: getErrorMessage(error) });
  }
}

/**
 * Hide request section
 */
function hideRequestSection(): void {
  requestSectionEl.classList.add('hidden');
}

/**
 * Check if Native Host is available
 */
async function checkNativeAvailable(): Promise<void> {
  try {
    const response = await browser.runtime.sendMessage({ action: 'isNativeAvailable' });
    const res = response as { available?: boolean; success?: boolean; version?: string };
    isNativeAvailable = res.available ?? res.success ?? false;

    if (isNativeAvailable) {
      nativeStatusEl.textContent = `Host nativo v${res.version ?? '?'}`;
      nativeStatusEl.className = 'status-indicator available';
    } else {
      nativeStatusEl.textContent = 'Host nativo no disponible';
      nativeStatusEl.className = 'status-indicator unavailable';
    }

    // Enable/disable verify button based on availability
    btnVerify.disabled = !isNativeAvailable;
    refreshRequestButtonState();
  } catch {
    isNativeAvailable = false;
    nativeStatusEl.textContent = 'Error de comunicación';
    nativeStatusEl.className = 'status-indicator unavailable';
    btnVerify.disabled = true;
    refreshRequestButtonState();
  }
}

/**
 * Verify domains against local whitelist via Native Messaging
 */
async function verifyDomainsWithNative(): Promise<void> {
  const hostnames = Object.keys(blockedDomainsData).sort();
  if (hostnames.length === 0 || !isNativeAvailable) return;

  btnVerify.disabled = true;
  btnVerify.textContent = '⌛ Verificando...';
  verifyListEl.innerHTML = '<div class="loading">Consultando host nativo...</div>';
  verifyResultsEl.classList.remove('hidden');

  try {
    const response = await browser.runtime.sendMessage({
      action: 'checkWithNative',
      domains: hostnames,
    });

    const res = response as VerifyResponse;

    if (res.success) {
      renderVerifyResults(res.results);
    } else {
      verifyListEl.innerHTML = `<div class="error-text">Error: ${res.error ?? 'Error desconocido'}</div>`;
    }
  } catch (error) {
    logger.error('[Popup] Error verifying domains', { error: getErrorMessage(error) });
    verifyListEl.innerHTML = '<div class="error-text">Error al comunicar con el host nativo</div>';
  } finally {
    btnVerify.disabled = false;
    btnVerify.textContent = '🔍 Verificar en Whitelist';
  }
}

/**
 * Render results of native verification
 */
function renderVerifyResults(results: VerifyResult[]): void {
  if (results.length === 0) {
    verifyListEl.innerHTML = '<div>No hay resultados</div>';
    return;
  }

  verifyListEl.innerHTML = '';
  results.forEach((res) => {
    const item = document.createElement('li');
    item.className = 'verify-item';

    const inWhitelist = res.in_whitelist ?? res.inWhitelist;
    const resolvedIp = res.resolvedIp ?? res.resolved_ip;
    const statusClass = inWhitelist ? 'status-allowed' : 'status-blocked';
    const statusText = inWhitelist ? 'PERMITIDO' : 'BLOQUEADO';
    const ipInfo = resolvedIp ? `<span class="ip-info">${resolvedIp}</span>` : '';

    item.innerHTML = `
            <span class="verify-domain">${res.domain}</span>
            <div class="verify-meta">
                ${ipInfo}
                <span class="verify-status ${statusClass}">${statusText}</span>
            </div>
        `;
    verifyListEl.appendChild(item);
  });
}

/**
 * Hide verification results
 */
function hideVerifyResults(): void {
  verifyResultsEl.classList.add('hidden');
  verifyListEl.innerHTML = '';
}

// Access global config from config.js (loaded before popup.ts via manifest)
// Window interface is extended in types.d.ts for type-safe access
// Runtime check ensures CONFIG is defined - throws if not
if (window.OPENPATH_CONFIG === undefined) {
  throw new Error('OpenPath config not loaded - config.js must be loaded first');
}
let CONFIG: Config = window.OPENPATH_CONFIG;

/**
 * Check if the request API is available
 */
async function checkRequestApiAvailable(): Promise<boolean> {
  if (!isRequestConfigured()) {
    return false;
  }

  try {
    const response = await fetchWithFallback(
      '/health',
      {
        method: 'GET',
      },
      5000
    );

    if (response.ok) {
      return true;
    }
  } catch (error) {
    if (CONFIG.debugMode) {
      logger.debug('[Popup] Request API not available', { error: getErrorMessage(error) });
    }
  }

  return false;
}

/**
 * Toggle request section visibility
 */
function toggleRequestSection(): void {
  const isHidden = requestSectionEl.classList.contains('hidden');

  if (isHidden) {
    // Show and populate
    requestSectionEl.classList.remove('hidden');
    populateRequestDomainSelect();
    hideVerifyResults();
  } else {
    // Hide
    requestSectionEl.classList.add('hidden');
    hideRequestStatus();
  }
}

/**
 * Populate the domain select dropdown with origin info
 */
function populateRequestDomainSelect(): void {
  const hostnames = Object.keys(blockedDomainsData).sort();

  requestDomainSelectEl.innerHTML = '<option value="">Seleccionar dominio...</option>';

  hostnames.forEach((hostname) => {
    const data = blockedDomainsData[hostname];
    if (!data) return;
    const origin = data.origin ?? 'desconocido';
    const option = document.createElement('option');
    option.value = hostname;
    option.textContent = hostname;
    option.dataset.origin = origin;
    requestDomainSelectEl.appendChild(option);
  });

  updateSubmitButtonState();
}

/**
 * Update submit button enabled state
 */
function updateSubmitButtonState(): void {
  const hasSelection = requestDomainSelectEl.value !== '';

  const hasReason = requestReasonEl.value.trim().length >= 3;

  btnSubmitRequest.disabled =
    !hasSelection ||
    !hasReason ||
    !isRequestConfigured() ||
    !isNativeAvailable ||
    !isRequestApiAvailable;
}

/**
 * Submit a domain request to approval queue
 */
async function submitDomainRequest(): Promise<void> {
  const domain = requestDomainSelectEl.value;
  const reason = requestReasonEl.value.trim();
  const selectedInfo = blockedDomainsData[domain];
  const extensionVersion = browser.runtime.getManifest().version;

  if (!domain || reason.length < 3) {
    showRequestStatus('❌ Selecciona un dominio y escribe un motivo', 'error');
    return;
  }

  if (!isRequestConfigured() || !isNativeAvailable) {
    showRequestStatus('❌ Configuración incompleta para solicitar dominios', 'error');
    return;
  }

  // Disable button while submitting
  btnSubmitRequest.disabled = true;
  btnSubmitRequest.textContent = '⏳ Enviando...';
  showRequestStatus('Enviando solicitud...', 'pending');

  try {
    let machineHostname: string | undefined;
    try {
      const hostResponse = await browser.runtime.sendMessage({ action: 'getHostname' });
      const hostPayload = hostResponse as { success?: boolean; hostname?: string };
      if (hostPayload.success && hostPayload.hostname) {
        machineHostname = hostPayload.hostname;
      }
    } catch {
      machineHostname = undefined;
    }

    if (!machineHostname) {
      showRequestStatus('❌ No se pudo obtener el hostname del equipo', 'error');
      showToast('❌ Hostname no disponible');
      return;
    }

    const token = await generateProofToken(machineHostname, CONFIG.sharedSecret.trim());

    const apiResponse = await fetchWithFallback(
      '/api/requests/submit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          reason,
          token,
          hostname: machineHostname,
          origin_host: selectedInfo?.origin ?? undefined,
          client_version: extensionVersion,
          error_type: selectedInfo?.errors?.[0],
        }),
      },
      CONFIG.requestTimeout
    );

    const payload = (await apiResponse.json()) as Partial<SubmitRequestResult>;

    if (apiResponse.ok && payload.success === true && payload.id) {
      showRequestStatus(
        `✅ Solicitud enviada para ${domain}. Queda pendiente de aprobación.`,
        'success'
      );
      showToast('✅ Solicitud enviada');

      // Clear form
      requestDomainSelectEl.value = '';
      requestReasonEl.value = '';
      await loadDomainStatuses();
      renderDomainsList();
    } else {
      const errorMsg = payload.error ?? 'Error desconocido';
      showRequestStatus(`❌ ${errorMsg}`, 'error');
      showToast(`❌ ${errorMsg}`);
    }
  } catch (error) {
    let errorMsg = 'Error de conexión';
    const err = error instanceof Error ? error : new Error(String(error));

    if (err.name === 'AbortError') {
      errorMsg = 'Timeout - servidor no responde';
    } else if (err.message) {
      errorMsg = err.message;
    }

    showRequestStatus(`❌ ${errorMsg}`, 'error');
    showToast('❌ Error al enviar');

    if (CONFIG.debugMode) {
      logger.error('[Popup] Request error', { error: err.message });
    }
  } finally {
    btnSubmitRequest.disabled = false;
    btnSubmitRequest.textContent = 'Enviar Solicitud';
    updateSubmitButtonState();
  }
}

/**
 * Show request status message
 */
function showRequestStatus(message: string, type = 'info'): void {
  requestStatusEl.classList.remove('hidden', 'success', 'error', 'pending');
  requestStatusEl.classList.add(type);
  requestStatusEl.textContent = message;
}

/**
 * Hide request status message
 */
function hideRequestStatus(): void {
  requestStatusEl.classList.add('hidden');
  requestStatusEl.textContent = '';
}

async function retryDomainLocalUpdate(hostname: string): Promise<void> {
  if (currentTabId === null) return;

  try {
    const response = await browser.runtime.sendMessage({
      action: 'retryLocalUpdate',
      tabId: currentTabId,
      hostname,
    });
    const result = response as { success: boolean };
    if (result.success) {
      showToast('Whitelist local actualizada');
    } else {
      showToast('No se pudo actualizar whitelist local');
    }
    await loadDomainStatuses();
    renderDomainsList();
  } catch (error) {
    logger.error('[Popup] Error retrying local update', { error: getErrorMessage(error) });
    showToast('Error al reintentar actualización local');
  }
}

/**
 * Inicializa el popup
 */
async function init(): Promise<void> {
  try {
    if (window.loadOpenPathConfig) {
      CONFIG = await window.loadOpenPathConfig();
    }

    // Obtener pestaña activa
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });

    if (tabs.length === 0) {
      tabDomainEl.textContent = 'Sin pestaña activa';
      return;
    }

    const tab = tabs[0];
    if (!tab?.id) {
      tabDomainEl.textContent = 'Error: Pestaña inválida';
      return;
    }
    currentTabId = tab.id;

    // Mostrar hostname de la pestaña actual
    tabDomainEl.textContent = extractTabHostname(tab.url ?? '');

    // Cargar dominios bloqueados
    await loadBlockedDomains();

    // Verificar si Native Messaging está disponible
    await checkNativeAvailable();

    // Verificar si Request API está disponible
    isRequestApiAvailable = await checkRequestApiAvailable();
    refreshRequestButtonState();
  } catch (error) {
    logger.error('[Popup] Error de inicialización', { error: getErrorMessage(error) });
    tabDomainEl.textContent = 'Error';
  }
}

// Event Listeners
btnCopy.addEventListener('click', () => {
  void copyToClipboard();
});
btnClear.addEventListener('click', () => {
  void clearDomains();
});
btnVerify.addEventListener('click', () => {
  void verifyDomainsWithNative();
});
btnRequest.addEventListener('click', toggleRequestSection);
btnSubmitRequest.addEventListener('click', () => {
  void submitDomainRequest();
});
requestDomainSelectEl.addEventListener('change', updateSubmitButtonState);
requestReasonEl.addEventListener('input', updateSubmitButtonState);
domainsListEl.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (!target.classList.contains('retry-update-btn')) {
    return;
  }

  const hostname = target.dataset.hostname;
  if (!hostname) {
    return;
  }

  void retryDomainLocalUpdate(hostname);
});

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', () => {
  void init();
});
