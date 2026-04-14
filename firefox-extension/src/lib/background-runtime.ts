import type { Browser, WebNavigation, WebRequest } from 'webextension-polyfill';
import { createAutoAllowWorkflow, isAutoAllowRequestType } from './auto-allow-workflow.js';
import { createBackgroundMessageHandler } from './background-message-handler.js';
import { logger, getErrorMessage } from './logger.js';
import { getRequestApiEndpoints, loadRequestConfig } from './config-storage.js';
import { buildBlockedDomainSubmitBody } from './blocked-request.js';
import { createBlockedMonitorState } from './blocked-monitor-state.js';
import {
  createNativeMessagingClient,
  type NativeResponse,
  type VerifyResponse,
} from './native-messaging-client.js';
import {
  submitBlockedDomainRequest as submitBlockedDomainRequestViaApi,
  type SubmitBlockedDomainInput,
  type SubmitBlockedDomainResult,
} from './request-api.js';
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
} from './path-blocking.js';
import { shouldClearBlockedMonitorStateOnNavigate } from './blocked-screen-contract.js';

interface BlockedScreenContext {
  tabId: number;
  hostname: string;
  error: string;
  origin: string | null;
}

const NATIVE_HOST_NAME = 'whitelist_native_host';
const BLOCKING_ERRORS = [
  'NS_ERROR_UNKNOWN_HOST',
  'NS_ERROR_CONNECTION_REFUSED',
  'NS_ERROR_NET_TIMEOUT',
  'NS_ERROR_PROXY_CONNECTION_REFUSED',
];
const IGNORED_ERRORS = ['NS_BINDING_ABORTED', 'NS_ERROR_ABORT'];
const BLOCKED_SCREEN_ERRORS = new Set([
  'NS_ERROR_UNKNOWN_HOST',
  'NS_ERROR_PROXY_CONNECTION_REFUSED',
]);
const BLOCKED_PATH_REFRESH_INTERVAL_MS = 60000;
const BLOCKED_PATH_INITIAL_RETRY_DELAY_MS = 2000;
const BLOCKED_PATH_MAX_RETRIES = 3;

interface BackgroundRuntimeOptions {
  hostName?: string;
}

interface BackgroundRuntime {
  init: () => Promise<void>;
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

export function createBackgroundRuntime(
  browser: Browser,
  options: BackgroundRuntimeOptions = {}
): BackgroundRuntime {
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

  const nativeMessagingClient = createNativeMessagingClient({
    hostName: options.hostName ?? NATIVE_HOST_NAME,
    logger,
  });

  let blockedPathRulesState: BlockedPathRulesState = {
    version: '',
    rules: [],
  };
  let blockedPathRefreshTimer: ReturnType<typeof setInterval> | null = null;

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

  async function checkDomainsWithNative(domains: string[]): Promise<VerifyResponse> {
    return await nativeMessagingClient.checkDomains(domains);
  }

  async function isNativeHostAvailable(): Promise<boolean> {
    return await nativeMessagingClient.isAvailable();
  }

  async function submitBlockedDomainRequest(
    input: SubmitBlockedDomainInput
  ): Promise<SubmitBlockedDomainResult> {
    return await submitBlockedDomainRequestViaApi(input, {
      buildBlockedDomainSubmitBody,
      getClientVersion: () => browser.runtime.getManifest().version,
      getRequestApiEndpoints: (config) =>
        getRequestApiEndpoints({
          ...config,
          debugMode: false,
          sharedSecret: '',
        }),
      loadRequestConfig,
      sendNativeMessage: (message) => nativeMessagingClient.sendMessage(message),
    });
  }

  const { autoAllowBlockedDomain, retryLocalUpdate } = createAutoAllowWorkflow({
    getErrorMessage,
    getRequestApiEndpoints: (config) =>
      getRequestApiEndpoints({
        ...config,
        debugMode: false,
        sharedSecret: '',
      }),
    getStoredDomainStatus: (tabId, hostname) => domainStatuses[tabId]?.get(hostname),
    inFlightAutoRequests,
    loadRequestConfig,
    refreshBlockedPathRules: () => refreshBlockedPathRules(true),
    requestLocalWhitelistUpdate: () => nativeMessagingClient.requestLocalWhitelistUpdate(),
    sendNativeMessage: (message) => nativeMessagingClient.sendMessage(message),
    setDomainStatus,
  });

  const handleRuntimeMessage = createBackgroundMessageHandler({
    clearBlockedDomains,
    evaluateBlockedPathDebug: (input) =>
      evaluatePathBlocking({ type: input.type, url: input.url }, blockedPathRulesState.rules, {
        extensionOrigin: browser.runtime.getURL('/'),
      }),
    forceBlockedPathRulesRefresh,
    getBlockedDomainsForTab,
    getDomainStatusesForTab,
    getErrorMessage,
    getMachineToken: () => nativeMessagingClient.sendMessage({ action: 'get-machine-token' }),
    getNativeBlockedPathsDebug: async () =>
      (await nativeMessagingClient.sendMessage({
        action: 'get-blocked-paths',
      })) as NativeBlockedPathsResponse,
    getPathRulesDebug: () => ({
      success: true,
      version: blockedPathRulesState.version,
      count: blockedPathRulesState.rules.length,
      rawRules: blockedPathRulesState.rules.map((rule) => rule.rawRule),
      compiledPatterns: blockedPathRulesState.rules.flatMap((rule) => rule.compiledPatterns),
    }),
    getSystemHostname: () => nativeMessagingClient.sendMessage({ action: 'get-hostname' }),
    isNativeHostAvailable,
    retryLocalUpdate,
    submitBlockedDomainRequest,
    triggerWhitelistUpdate: async (): Promise<NativeResponse> => {
      const response = (await nativeMessagingClient.sendMessage({
        action: 'update-whitelist',
      })) as NativeResponse;
      if (response.success) {
        await refreshBlockedPathRules(true);
      }
      return response;
    },
    verifyDomains: checkDomainsWithNative,
  });

  function registerEventListeners(): void {
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
          addBlockedDomain(
            details.tabId,
            hostname,
            reason,
            details.originUrl ?? details.documentUrl
          );
        }

        if (result.redirectUrl) {
          return { redirectUrl: result.redirectUrl };
        }

        return { cancel: true };
      },
      { urls: ['<all_urls>'], types: [...PATH_BLOCKING_FILTER_TYPES] as WebRequest.ResourceType[] },
      ['blocking']
    );

    browser.webRequest.onErrorOccurred.addListener(
      (details: WebRequest.OnErrorOccurredDetailsType) => {
        if (IGNORED_ERRORS.includes(details.error)) {
          return;
        }

        if (!BLOCKING_ERRORS.includes(details.error)) {
          return;
        }

        const hostname = extractHostname(details.url);
        if (!hostname || details.tabId < 0) {
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

    browser.tabs.onRemoved.addListener((tabId: number) => {
      disposeTab(tabId);
      logger.debug(`[Monitor] Tab ${tabId.toString()} cerrada, datos eliminados`);
    });

    browser.runtime.onMessage.addListener(handleRuntimeMessage);
  }

  async function init(): Promise<void> {
    registerEventListeners();
    await initBlockedPathRules();
    startBlockedPathRefreshLoop();
    logger.info('[Monitor de Bloqueos] Background script v2.0.0 (MV3) cargado');
  }

  return {
    init,
  };
}
