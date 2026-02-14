/**
 * OpenPath Firefox Extension - Popup Script
 * Handles the popup UI and communication with background script
 */

import { logger, getErrorMessage } from './lib/logger.js';

interface BlockedDomainInfo {
  count: number;
  timestamp: number;
  origin?: string;
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
  error?: string;
}

interface VerifyResponse {
  success: boolean;
  results: VerifyResult[];
  error?: string;
}

interface RequestResponse {
  success: boolean;
  groupId?: string;
  error?: string;
}

interface BlockedDomainsResponse {
  domains?: Record<string, SerializedBlockedDomain>;
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
    renderDomainsList();
  } catch (error) {
    logger.error('[Popup] Error loading blocked domains', { error: getErrorMessage(error) });
    blockedDomainsData = {};
    renderDomainsList();
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
    return;
  }

  countEl.textContent = hostnames.length.toString();
  domainsListEl.classList.remove('hidden');
  emptyMessageEl.classList.add('hidden');
  btnCopy.disabled = false;
  btnVerify.disabled = !isNativeAvailable;
  // btnRequest state depends on API availability check later

  domainsListEl.innerHTML = '';
  hostnames.forEach((hostname) => {
    const info = blockedDomainsData[hostname];
    if (!info) return;

    const item = document.createElement('li');
    item.className = 'domain-item';
    item.innerHTML = `
            <span class="domain-name" title="${hostname}">${hostname}</span>
            <span class="domain-count" title="Intentos de conexión">${info.count.toString()}</span>
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
  } catch {
    isNativeAvailable = false;
    nativeStatusEl.textContent = 'Error de comunicación';
    nativeStatusEl.className = 'status-indicator unavailable';
    btnVerify.disabled = true;
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

    const statusClass = res.inWhitelist ? 'status-allowed' : 'status-blocked';
    const statusText = res.inWhitelist ? 'PERMITIDO' : 'BLOQUEADO';
    const ipInfo = res.resolvedIp ? `<span class="ip-info">${res.resolvedIp}</span>` : '';

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
  const apiUrl = CONFIG.requestApiUrl;

  if (!apiUrl || !CONFIG.enableRequests) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 5000);

  try {
    const response = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      return true;
    }
  } catch (error) {
    clearTimeout(timeout);
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

  btnSubmitRequest.disabled = !hasSelection || !hasReason;
}

/**
 * Generate token from hostname using SHA-256
 */
async function generateToken(hostname: string, secret: string): Promise<string> {
  const data = new TextEncoder().encode(hostname + secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  // btoa is available in browser
  return btoa(String.fromCharCode(...hashArray));
}

/**
 * Submit a domain request using auto-inclusion endpoint
 */
async function submitDomainRequest(): Promise<void> {
  const domain = requestDomainSelectEl.value;
  const reason = requestReasonEl.value.trim();
  const selectedOption = requestDomainSelectEl.selectedOptions[0];
  const origin = selectedOption ? (selectedOption.dataset.origin ?? '') : '';

  if (!domain || reason.length < 3) {
    showRequestStatus('❌ Selecciona un dominio y escribe un motivo', 'error');
    return;
  }

  if (!origin) {
    showRequestStatus('❌ El dominio no tiene un origen válido', 'error');
    return;
  }

  const apiUrl = CONFIG.requestApiUrl;
  const sharedSecret = CONFIG.sharedSecret;

  // Disable button while submitting
  btnSubmitRequest.disabled = true;
  btnSubmitRequest.textContent = '⏳ Enviando...';
  showRequestStatus('Enviando solicitud...', 'pending');

  try {
    // Get hostname via Native Messaging
    const response = await browser.runtime.sendMessage({ action: 'getHostname' });
    const hostnameResult = response as { success: boolean; hostname: string };
    if (!hostnameResult.success) {
      throw new Error('No se pudo obtener el hostname del sistema');
    }
    const systemHostname = hostnameResult.hostname;

    // Generate token
    const token = await generateToken(systemHostname, sharedSecret);

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, CONFIG.requestTimeout);

    // Use auto-inclusion endpoint
    const apiResponse = await fetch(`${apiUrl}/api/requests/auto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain,
        origin_page: origin,
        token,
        hostname: systemHostname,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = (await apiResponse.json()) as RequestResponse;

    if (apiResponse.ok && data.success) {
      showRequestStatus(
        `✅ Dominio añadido a ${data.groupId ?? 'grupo'}\nActualizando whitelist local...`,
        'success'
      );

      // MultiReplace note: skipping lines for brevity where unchanged
      // Trigger local whitelist update
      try {
        const updateResponse = await browser.runtime.sendMessage({
          action: 'triggerWhitelistUpdate',
        });
        const updateResult = updateResponse as { success: boolean };
        if (updateResult.success) {
          showRequestStatus(
            `✅ Dominio ${domain} añadido y whitelist local actualizada`,
            'success'
          );
          showToast('✅ Dominio añadido y WL actualizada');
        } else {
          showRequestStatus('✅ Dominio añadido (actualización local pendiente)', 'success');
          showToast('✅ Dominio añadido');
        }
      } catch (updateError) {
        logger.warn('Whitelist update failed', {
          error: updateError instanceof Error ? updateError.message : String(updateError),
        });
        showToast('✅ Dominio añadido');
      }

      // Clear form
      requestDomainSelectEl.value = '';
      requestReasonEl.value = '';
    } else {
      const errorMsg = data.error ?? 'Error desconocido';
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
    const requestAvailable = await checkRequestApiAvailable();
    if (requestAvailable) {
      btnRequest.classList.remove('hidden');
      btnRequest.disabled = false;
    } else {
      btnRequest.classList.add('hidden');
    }
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

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', () => {
  void init();
});
