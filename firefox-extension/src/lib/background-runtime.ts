import type { Browser } from 'webextension-polyfill';
import { createAutoAllowWorkflow } from './auto-allow-workflow.js';
import { registerBackgroundListeners } from './background-listeners.js';
import { createBackgroundMessageHandler } from './background-message-handler.js';
import { createBackgroundPathRulesController } from './background-path-rules.js';
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
  buildBlockedScreenRedirectUrl,
  extractHostname,
  type NativeBlockedPathsResponse,
} from './path-blocking.js';

interface BlockedScreenContext {
  tabId: number;
  hostname: string;
  error: string;
  origin: string | null;
}

interface ConfirmBlockedScreenContext extends BlockedScreenContext {
  url: string;
}

const NATIVE_HOST_NAME = 'whitelist_native_host';
interface BackgroundRuntimeOptions {
  hostName?: string;
}

interface BackgroundRuntime {
  init: () => Promise<void>;
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
  const extensionOrigin = browser.runtime.getURL('/');
  const blockedPathRulesController = createBackgroundPathRulesController({
    extensionOrigin,
    getBlockedPaths: async () =>
      (await nativeMessagingClient.sendMessage({
        action: 'get-blocked-paths',
      })) as NativeBlockedPathsResponse,
  });

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

  async function confirmBlockedScreenNavigation(
    context: ConfirmBlockedScreenContext
  ): Promise<boolean> {
    const response = await checkDomainsWithNative([context.hostname]);
    if (!response.success) {
      return false;
    }

    const result = response.results.find((item) => item.domain === context.hostname);
    const resolves = result?.resolves ?? result?.resolvedIp !== undefined;
    return result?.inWhitelist === false && !resolves;
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
    refreshBlockedPathRules: () => blockedPathRulesController.refresh(true),
    requestLocalWhitelistUpdate: () => nativeMessagingClient.requestLocalWhitelistUpdate(),
    sendNativeMessage: (message) => nativeMessagingClient.sendMessage(message),
    setDomainStatus,
  });
  const forceBlockedPathRulesRefresh = blockedPathRulesController.forceRefresh;

  const handleRuntimeMessage = createBackgroundMessageHandler({
    clearBlockedDomains,
    evaluateBlockedPathDebug: (input) =>
      blockedPathRulesController.evaluateRequest({ type: input.type, url: input.url } as never),
    forceBlockedPathRulesRefresh,
    getBlockedDomainsForTab,
    getDomainStatusesForTab,
    getErrorMessage,
    getMachineToken: () => nativeMessagingClient.sendMessage({ action: 'get-machine-token' }),
    getNativeBlockedPathsDebug: async () =>
      (await nativeMessagingClient.sendMessage({
        action: 'get-blocked-paths',
      })) as NativeBlockedPathsResponse,
    getPathRulesDebug: blockedPathRulesController.getDebugState,
    getSystemHostname: () => nativeMessagingClient.sendMessage({ action: 'get-hostname' }),
    isNativeHostAvailable,
    retryLocalUpdate,
    submitBlockedDomainRequest,
    triggerWhitelistUpdate: async (): Promise<NativeResponse> => {
      const response = (await nativeMessagingClient.sendMessage({
        action: 'update-whitelist',
      })) as NativeResponse;
      if (response.success) {
        await blockedPathRulesController.refresh(true);
      }
      return response;
    },
    verifyDomains: checkDomainsWithNative,
  });

  async function init(): Promise<void> {
    registerBackgroundListeners({
      addBlockedDomain: (tabId, hostname, error, origin) => {
        addBlockedDomain(tabId, hostname, error, origin ?? undefined);
      },
      autoAllowBlockedDomain,
      browser,
      clearTabRuntimeState,
      disposeTab,
      evaluateBlockedPath: blockedPathRulesController.evaluateRequest,
      confirmBlockedScreenNavigation,
      handleRuntimeMessage,
      redirectToBlockedScreen,
    });
    await blockedPathRulesController.init();
    blockedPathRulesController.startRefreshLoop();
    logger.info('[Monitor de Bloqueos] Background script v2.0.0 (MV3) cargado');
  }

  return {
    init,
  };
}
