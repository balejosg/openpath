/**
 * OpenPath Firefox Extension - Popup Script
 * Handles the popup UI and communication with background script
 */

import { logger, getErrorMessage } from './lib/logger.js';
import { buildSubmitBlockedDomainRequestMessage } from './lib/blocked-screen-contract.js';
import {
  DEFAULT_REQUEST_CONFIG,
  hasValidRequestConfig,
  loadRequestConfig,
  type RequestConfig,
} from './lib/config-storage.js';
import { shouldEnableRequestAction, type BlockedDomainsData } from './lib/popup-state.js';
import {
  buildRequestDomainOptions,
  retryPopupDomainLocalUpdate,
  shouldEnableSubmitRequest,
  submitPopupDomainRequest,
} from './lib/popup-request-actions.js';
import {
  buildVerifyResultViewModels,
  verifyPopupDomains,
  type VerifyResult,
} from './lib/popup-native-actions.js';
import {
  buildBlockedDomainsClipboardText,
  checkPopupNativeAvailability,
  clearPopupDomainsForTab,
  loadPopupDomainSnapshot,
  loadPopupDomainStatuses,
  resolveActivePopupTab,
} from './lib/popup-runtime.js';
import {
  buildBlockedDomainListItems,
  buildRequestStatusPresentation,
} from './lib/popup-view-models.js';

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

function isRequestConfigured(): boolean {
  return hasValidRequestConfig(CONFIG);
}

function refreshRequestButtonState(): void {
  const hasDomains = Object.keys(blockedDomainsData).length > 0;
  const canRequest = shouldEnableRequestAction({
    hasDomains,
    nativeAvailable: isNativeAvailable,
    requestConfigured: isRequestConfigured(),
  });

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
    const snapshot = await loadPopupDomainSnapshot(currentTabId, (message) =>
      browser.runtime.sendMessage(message)
    );
    blockedDomainsData = snapshot.blockedDomainsData;
    domainStatusesData = snapshot.domainStatusesData;
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

  domainStatusesData = await loadPopupDomainStatuses(currentTabId, (message) =>
    browser.runtime.sendMessage(message)
  );
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
  buildBlockedDomainListItems({
    blockedDomainsData,
    currentTabId,
    domainStatusesData,
  }).forEach((viewModel) => {
    const item = document.createElement('li');
    item.className = 'domain-item';
    const retryButton = viewModel.retryHostname
      ? `<button class="retry-update-btn" data-hostname="${viewModel.retryHostname}" title="Reintentar actualización local">Reintentar</button>`
      : '';

    item.innerHTML = `
            <span class="domain-name" title="${viewModel.hostname}">${viewModel.hostname}</span>
            <span class="domain-meta">
                <span class="domain-count" title="Intentos de conexión">${viewModel.attempts.toString()}</span>
                <span class="domain-status ${viewModel.statusClassName}" title="${viewModel.statusLabel}">${viewModel.statusLabel}</span>
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
  const text = buildBlockedDomainsClipboardText(blockedDomainsData);
  if (!text) return;

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
    await clearPopupDomainsForTab(currentTabId, (message) => browser.runtime.sendMessage(message));
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
    const nativeState = await checkPopupNativeAvailability((message) =>
      browser.runtime.sendMessage(message)
    );
    isNativeAvailable = nativeState.available;
    nativeStatusEl.textContent = nativeState.label;
    nativeStatusEl.className = nativeState.className;

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
  const hasHostnames = Object.keys(blockedDomainsData).length > 0;
  if (!hasHostnames || !isNativeAvailable) return;

  btnVerify.disabled = true;
  btnVerify.textContent = '⌛ Verificando...';
  verifyListEl.innerHTML = '<div class="loading">Consultando host nativo...</div>';
  verifyResultsEl.classList.remove('hidden');

  try {
    const result = await verifyPopupDomains({
      blockedDomainsData,
      isNativeAvailable,
      sendMessage: (message) => browser.runtime.sendMessage(message),
    });

    if (result.ok) {
      renderVerifyResults(result.results);
    } else if ('errorMessage' in result) {
      verifyListEl.innerHTML = `<div class="error-text">Error: ${result.errorMessage}</div>`;
    } else {
      hideVerifyResults();
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
  buildVerifyResultViewModels(results).forEach((result) => {
    const item = document.createElement('li');
    item.className = 'verify-item';

    const ipInfo = result.resolvedIp ? `<span class="ip-info">${result.resolvedIp}</span>` : '';

    item.innerHTML = `
            <span class="verify-domain">${result.domain}</span>
            <div class="verify-meta">
                ${ipInfo}
                <span class="verify-status ${result.statusClass}">${result.statusText}</span>
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

let CONFIG: RequestConfig = { ...DEFAULT_REQUEST_CONFIG };

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
  requestDomainSelectEl.innerHTML = '<option value="">Seleccionar dominio...</option>';

  buildRequestDomainOptions(blockedDomainsData).forEach(({ hostname, origin }) => {
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
  btnSubmitRequest.disabled = !shouldEnableSubmitRequest({
    hasSelectedDomain: requestDomainSelectEl.value !== '',
    hasValidReason: requestReasonEl.value.trim().length >= 3,
    isNativeAvailable,
    isRequestConfigured: isRequestConfigured(),
  });
}

/**
 * Submit a domain request to approval queue
 */
async function submitDomainRequest(): Promise<void> {
  const domain = requestDomainSelectEl.value;
  const reason = requestReasonEl.value.trim();

  // Disable button while submitting
  btnSubmitRequest.disabled = true;
  btnSubmitRequest.textContent = '⏳ Enviando...';
  showRequestStatus('Enviando solicitud...', 'pending');

  try {
    const result = await submitPopupDomainRequest({
      blockedDomainsData,
      buildSubmitMessage: buildSubmitBlockedDomainRequestMessage,
      domain,
      isNativeAvailable,
      isRequestConfigured: isRequestConfigured(),
      reason,
      sendMessage: (message) => browser.runtime.sendMessage(message),
    });

    showRequestStatus(result.userMessage, result.success ? 'success' : 'error');

    if (result.success) {
      showToast('✅ Solicitud enviada');
      if (result.shouldResetForm) {
        requestDomainSelectEl.value = '';
        requestReasonEl.value = '';
      }
      if (result.shouldReloadDomainStatuses) {
        await loadDomainStatuses();
        renderDomainsList();
      }
    } else {
      showToast(result.userMessage);
    }
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    showRequestStatus(`❌ ${errorMessage}`, 'error');
    showToast('❌ Error al enviar');

    if (CONFIG.debugMode) {
      logger.error('[Popup] Request error', { error: errorMessage });
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
  const presentation = buildRequestStatusPresentation(type);
  requestStatusEl.classList.remove(...presentation.classesToRemove);
  requestStatusEl.classList.add(...presentation.classesToAdd);
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
  try {
    const result = await retryPopupDomainLocalUpdate({
      hostname,
      sendMessage: (message) => browser.runtime.sendMessage(message),
      tabId: currentTabId,
    });
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
    CONFIG = await loadRequestConfig();

    // Obtener pestaña activa
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTab = resolveActivePopupTab(tabs);
    if (activeTab.errorText) {
      tabDomainEl.textContent = activeTab.errorText;
      return;
    }
    currentTabId = activeTab.currentTabId ?? null;

    // Mostrar hostname de la pestaña actual
    tabDomainEl.textContent = activeTab.currentTabHostname ?? 'Error';

    // Cargar dominios bloqueados
    await loadBlockedDomains();

    // Verificar si Native Messaging está disponible
    await checkNativeAvailable();

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
