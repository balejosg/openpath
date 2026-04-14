import type { Browser } from 'webextension-polyfill';
import { logger, getErrorMessage } from './logger.js';
import { createPopupElements, registerPopupEventHandlers } from './popup-dom.js';
import {
  applyPopupNativeAvailability,
  applyPopupNativeError,
  hidePopupRequestStatus,
  hidePopupVerifyResults,
  renderPopupVerifyResults,
  resetPopupVerifyButton,
  showPopupRequestStatus,
  showPopupToast,
  showPopupVerifyCommunicationError,
  showPopupVerifyError,
  showPopupVerifyLoading,
} from './popup-feedback.js';
import {
  DEFAULT_REQUEST_CONFIG,
  hasValidRequestConfig,
  loadRequestConfig,
  type RequestConfig,
} from './config-storage.js';
import type { BlockedDomainsData } from './popup-state.js';
import { retryPopupDomainLocalUpdate, submitPopupDomainRequest } from './popup-request-actions.js';
import { verifyPopupDomains } from './popup-native-actions.js';
import {
  hidePopupRequestSection,
  renderPopupDomainsList,
  syncPopupRequestButtonState,
  syncPopupSubmitButtonState,
  togglePopupRequestSection,
} from './popup-ui.js';
import {
  buildBlockedDomainsClipboardText,
  checkPopupNativeAvailability,
  clearPopupDomainsForTab,
  loadPopupDomainSnapshot,
  loadPopupDomainStatuses,
  resolveActivePopupTab,
} from './popup-runtime.js';

interface PopupControllerOptions {
  buildSubmitMessage: (payload: {
    domain: string;
    error?: string;
    origin?: string;
    reason: string;
  }) => unknown;
}

interface PopupController {
  init: () => Promise<void>;
  mount: () => void;
}

export function createPopupController(
  browser: Browser,
  options: PopupControllerOptions
): PopupController {
  const {
    tabDomainEl,
    countEl,
    domainsListEl,
    emptyMessageEl,
    btnCopy,
    btnVerify,
    btnClear,
    btnRequest,
    toastEl,
    nativeStatusEl,
    verifyResultsEl,
    verifyListEl,
    requestSectionEl,
    requestDomainSelectEl,
    requestReasonEl,
    btnSubmitRequest,
    requestStatusEl,
  } = createPopupElements();

  let currentTabId: number | null = null;
  let blockedDomainsData: BlockedDomainsData = {};
  let isNativeAvailable = false;
  let domainStatusesData: Record<string, DomainStatus> = {};
  let config: RequestConfig = { ...DEFAULT_REQUEST_CONFIG };

  function showToast(message: string, duration = 3000): void {
    showPopupToast({
      duration,
      message,
      toastEl,
    });
  }

  function isRequestConfigured(): boolean {
    return hasValidRequestConfig(config);
  }

  function refreshRequestButtonState(): void {
    syncPopupRequestButtonState({
      btnRequest,
      hasDomains: Object.keys(blockedDomainsData).length > 0,
      nativeAvailable: isNativeAvailable,
      requestConfigured: isRequestConfigured(),
      requestSectionEl,
    });
  }

  function renderDomainsList(): void {
    renderPopupDomainsList({
      blockedDomainsData,
      btnCopy,
      btnVerify,
      countEl,
      currentTabId,
      domainStatusesData,
      domainsListEl,
      emptyMessageEl,
      isNativeAvailable,
    });
    refreshRequestButtonState();
  }

  async function loadBlockedDomains(): Promise<void> {
    if (currentTabId === null) {
      return;
    }

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
    if (currentTabId === null) {
      return;
    }

    domainStatusesData = await loadPopupDomainStatuses(currentTabId, (message) =>
      browser.runtime.sendMessage(message)
    );
  }

  async function copyToClipboard(): Promise<void> {
    const text = buildBlockedDomainsClipboardText(blockedDomainsData);
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showToast('Copiado al portapapeles');
    } catch (error) {
      logger.error('[Popup] Error copying to clipboard', { error: getErrorMessage(error) });
      showToast('Error al copiar');
    }
  }

  async function clearDomains(): Promise<void> {
    if (currentTabId === null) {
      return;
    }

    try {
      await clearPopupDomainsForTab(currentTabId, (message) =>
        browser.runtime.sendMessage(message)
      );
      blockedDomainsData = {};
      domainStatusesData = {};
      renderDomainsList();
      hidePopupVerifyResults({
        verifyListEl,
        verifyResultsEl,
      });
      hidePopupRequestSection(requestSectionEl);
      showToast('Lista limpiada');
    } catch (error) {
      logger.error('[Popup] Error clearing domains', { error: getErrorMessage(error) });
    }
  }

  async function checkNativeAvailable(): Promise<void> {
    try {
      const nativeState = await checkPopupNativeAvailability((message) =>
        browser.runtime.sendMessage(message)
      );
      isNativeAvailable = nativeState.available;
      applyPopupNativeAvailability({
        btnVerify,
        nativeState,
        nativeStatusEl,
      });
      refreshRequestButtonState();
    } catch {
      isNativeAvailable = false;
      applyPopupNativeError({
        btnVerify,
        nativeStatusEl,
      });
      refreshRequestButtonState();
    }
  }

  async function verifyDomainsWithNative(): Promise<void> {
    const hasHostnames = Object.keys(blockedDomainsData).length > 0;
    if (!hasHostnames || !isNativeAvailable) {
      return;
    }

    showPopupVerifyLoading({
      btnVerify,
      verifyListEl,
      verifyResultsEl,
    });

    try {
      const result = await verifyPopupDomains({
        blockedDomainsData,
        isNativeAvailable,
        sendMessage: (message) => browser.runtime.sendMessage(message),
      });

      if (result.ok) {
        renderPopupVerifyResults({
          results: result.results,
          verifyListEl,
        });
      } else if ('errorMessage' in result) {
        showPopupVerifyError(verifyListEl, result.errorMessage);
      } else {
        hidePopupVerifyResults({
          verifyListEl,
          verifyResultsEl,
        });
      }
    } catch (error) {
      logger.error('[Popup] Error verifying domains', { error: getErrorMessage(error) });
      showPopupVerifyCommunicationError(verifyListEl);
    } finally {
      resetPopupVerifyButton(btnVerify);
    }
  }

  function updateSubmitButtonState(): void {
    syncPopupSubmitButtonState({
      btnSubmitRequest,
      hasSelectedDomain: requestDomainSelectEl.value !== '',
      hasValidReason: requestReasonEl.value.trim().length >= 3,
      isNativeAvailable,
      isRequestConfigured: isRequestConfigured(),
    });
  }

  function toggleRequestSection(): void {
    togglePopupRequestSection({
      blockedDomainsData,
      onHide: () => {
        hidePopupRequestStatus(requestStatusEl);
      },
      onShow: () => {
        hidePopupVerifyResults({
          verifyListEl,
          verifyResultsEl,
        });
        updateSubmitButtonState();
      },
      requestDomainSelectEl,
      requestSectionEl,
    });
  }

  async function submitDomainRequest(): Promise<void> {
    const domain = requestDomainSelectEl.value;
    const reason = requestReasonEl.value.trim();

    btnSubmitRequest.disabled = true;
    btnSubmitRequest.textContent = '⏳ Enviando...';
    showPopupRequestStatus({
      message: 'Enviando solicitud...',
      requestStatusEl,
      type: 'pending',
    });

    try {
      const result = await submitPopupDomainRequest({
        blockedDomainsData,
        buildSubmitMessage: options.buildSubmitMessage,
        domain,
        isNativeAvailable,
        isRequestConfigured: isRequestConfigured(),
        reason,
        sendMessage: (message) => browser.runtime.sendMessage(message),
      });

      showPopupRequestStatus({
        message: result.userMessage,
        requestStatusEl,
        type: result.success ? 'success' : 'error',
      });

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

      showPopupRequestStatus({
        message: `❌ ${errorMessage}`,
        requestStatusEl,
        type: 'error',
      });
      showToast('❌ Error al enviar');

      if (config.debugMode) {
        logger.error('[Popup] Request error', { error: errorMessage });
      }
    } finally {
      btnSubmitRequest.disabled = false;
      btnSubmitRequest.textContent = 'Enviar Solicitud';
      updateSubmitButtonState();
    }
  }

  async function retryDomainLocalUpdate(hostname: string): Promise<void> {
    try {
      const result = await retryPopupDomainLocalUpdate({
        hostname,
        sendMessage: (message) => browser.runtime.sendMessage(message),
        tabId: currentTabId,
      });
      showToast(
        result.success ? 'Whitelist local actualizada' : 'No se pudo actualizar whitelist local'
      );
      await loadDomainStatuses();
      renderDomainsList();
    } catch (error) {
      logger.error('[Popup] Error retrying local update', { error: getErrorMessage(error) });
      showToast('Error al reintentar actualización local');
    }
  }

  async function init(): Promise<void> {
    try {
      config = await loadRequestConfig();

      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const activeTab = resolveActivePopupTab(tabs);
      if (activeTab.errorText) {
        tabDomainEl.textContent = activeTab.errorText;
        return;
      }

      currentTabId = activeTab.currentTabId ?? null;
      tabDomainEl.textContent = activeTab.currentTabHostname ?? 'Error';

      await loadBlockedDomains();
      await checkNativeAvailable();
      refreshRequestButtonState();
    } catch (error) {
      logger.error('[Popup] Error de inicialización', { error: getErrorMessage(error) });
      tabDomainEl.textContent = 'Error';
    }
  }

  function mount(): void {
    registerPopupEventHandlers({
      elements: {
        btnCopy,
        btnClear,
        btnRequest,
        btnSubmitRequest,
        btnVerify,
        domainsListEl,
        requestDomainSelectEl,
        requestReasonEl,
      },
      onClear: () => {
        void clearDomains();
      },
      onCopy: () => {
        void copyToClipboard();
      },
      onDomReady: () => {
        void init();
      },
      onRequestInputChange: updateSubmitButtonState,
      onRetryUpdate: (hostname) => {
        void retryDomainLocalUpdate(hostname);
      },
      onSubmitRequest: () => {
        void submitDomainRequest();
      },
      onToggleRequest: toggleRequestSection,
      onVerify: () => {
        void verifyDomainsWithNative();
      },
    });
  }

  return {
    init,
    mount,
  };
}
