import type { Browser, Runtime, WebNavigation, WebRequest } from 'webextension-polyfill';
import { getErrorMessage, logger } from './logger.js';
import { shouldClearBlockedMonitorStateOnNavigate } from './blocked-screen-contract.js';
import {
  BLOCKED_SCREEN_PATH,
  ROUTE_BLOCK_REASON,
  extractHostname,
  isExtensionUrl,
} from './path-blocking.js';
import { isAutoAllowRequestType } from './auto-allow-workflow.js';

const BLOCKING_ERRORS = [
  'NS_ERROR_UNKNOWN_HOST',
  'NS_ERROR_CONNECTION_REFUSED',
  'NS_ERROR_NET_TIMEOUT',
  'NS_ERROR_PROXY_CONNECTION_REFUSED',
];
const IGNORED_ERRORS = ['NS_BINDING_ABORTED', 'NS_ERROR_ABORT'];
const IMMEDIATE_BLOCKED_SCREEN_ERRORS = new Set([
  'NS_ERROR_UNKNOWN_HOST',
  'NS_ERROR_PROXY_CONNECTION_REFUSED',
]);
const NATIVE_CONFIRMED_BLOCKED_SCREEN_ERRORS = new Set([
  'NS_ERROR_CONNECTION_REFUSED',
  'NS_ERROR_NET_TIMEOUT',
]);
const NATIVE_POLICY_BLOCKED_ERROR = 'OPENPATH_NATIVE_POLICY_BLOCKED';
const DUPLICATE_BLOCKED_SCREEN_REDIRECT_WINDOW_MS = 60_000;

interface BlockedScreenContext {
  tabId: number;
  hostname: string;
  error: string;
  origin: string | null;
}

interface ConfirmBlockedScreenContext extends BlockedScreenContext {
  url: string;
}

interface BackgroundListenersOptions {
  addBlockedDomain: (
    tabId: number,
    hostname: string,
    error: string,
    origin?: string | null
  ) => void;
  autoAllowBlockedDomain: (
    tabId: number,
    hostname: string,
    origin: string | null,
    requestType: WebRequest.ResourceType,
    targetUrl: string
  ) => Promise<void>;
  browser: Browser;
  clearTabRuntimeState: (tabId: number) => void;
  disposeTab: (tabId: number) => void;
  evaluateBlockedPath: (
    details: WebRequest.OnBeforeRequestDetailsType
  ) => { cancel?: boolean; redirectUrl?: string; reason?: string } | null;
  confirmBlockedScreenNavigation?: (context: ConfirmBlockedScreenContext) => Promise<boolean>;
  handleRuntimeMessage: (message: unknown, sender: Runtime.MessageSender) => Promise<unknown>;
  redirectToBlockedScreen: (context: BlockedScreenContext) => Promise<void>;
}

function createRuntimeMessageResponder(
  handleRuntimeMessage: BackgroundListenersOptions['handleRuntimeMessage']
): (
  message: unknown,
  sender: Runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => true {
  return (message, sender, sendResponse) => {
    void Promise.resolve(handleRuntimeMessage(message, sender)).then(
      (response) => {
        sendResponse(response);
      },
      (error: unknown) => {
        sendResponse({ success: false, error: getErrorMessage(error) });
      }
    );

    return true;
  };
}

function isTopFrameNavigation(details: { frameId?: number; type?: string }): boolean {
  if (details.type !== undefined) {
    return details.type === 'main_frame';
  }

  return details.frameId === 0;
}

function shouldDisplayBlockedScreenImmediately(details: {
  error: string;
  frameId?: number;
  type?: string;
  url: string;
}): boolean {
  return (
    isTopFrameNavigation(details) &&
    IMMEDIATE_BLOCKED_SCREEN_ERRORS.has(details.error) &&
    !isExtensionUrl(details.url)
  );
}

function shouldConfirmBlockedScreenNavigation(details: {
  error: string;
  frameId?: number;
  type?: string;
  url: string;
}): boolean {
  return (
    isTopFrameNavigation(details) &&
    NATIVE_CONFIRMED_BLOCKED_SCREEN_ERRORS.has(details.error) &&
    !isExtensionUrl(details.url)
  );
}

function buildBlockedScreenContext(details: {
  error: string;
  originUrl?: string;
  documentUrl?: string;
  tabId: number;
  url: string;
}): ConfirmBlockedScreenContext | null {
  const hostname = extractHostname(details.url);
  if (!hostname || details.tabId < 0) {
    return null;
  }

  return {
    tabId: details.tabId,
    hostname,
    error: details.error,
    origin: extractHostname(details.originUrl ?? details.documentUrl ?? ''),
    url: details.url,
  };
}

function buildRedirectKey(context: ConfirmBlockedScreenContext): string {
  return [context.tabId.toString(), context.hostname, context.error, context.url].join(':');
}

function normalizeAutoAllowOriginCandidate(
  candidateUrl: string | undefined,
  targetUrl: string
): string | null {
  if (!candidateUrl || candidateUrl === targetUrl || isExtensionUrl(candidateUrl)) {
    return null;
  }

  return extractHostname(candidateUrl) ? candidateUrl : null;
}

function buildDisplayedRedirectKey(context: ConfirmBlockedScreenContext): string {
  return [context.tabId.toString(), context.hostname, context.url].join(':');
}

function isSameBlockedScreenUrl(
  currentUrl: string,
  blockedScreenUrl: string,
  hostname: string
): boolean {
  try {
    const current = new URL(currentUrl);
    const blockedScreen = new URL(blockedScreenUrl);
    return (
      current.origin === blockedScreen.origin &&
      current.pathname === blockedScreen.pathname &&
      current.searchParams.get('domain') === hostname
    );
  } catch {
    return false;
  }
}

export function registerBackgroundListeners(options: BackgroundListenersOptions): void {
  const pendingBlockedScreenRedirects = new Set<string>();
  const displayedBlockedScreenRedirects = new Map<number, { key: string; redirectedAt: number }>();
  const latestNativePolicyPreflightByTab = new Map<number, string>();

  async function tabAlreadyShowsBlockedScreen(
    context: ConfirmBlockedScreenContext
  ): Promise<boolean> {
    try {
      const tab = await options.browser.tabs.get(context.tabId);
      return typeof tab.url === 'string'
        ? isSameBlockedScreenUrl(
            tab.url,
            options.browser.runtime.getURL(BLOCKED_SCREEN_PATH),
            context.hostname
          )
        : false;
    } catch {
      return false;
    }
  }

  async function redirectToBlockedScreenOnce(
    context: ConfirmBlockedScreenContext,
    optionsForRedirect: {
      isCurrentNavigation?: () => boolean;
      recordBlockedDomain?: boolean;
      requireNativeConfirmation: boolean;
    }
  ): Promise<void> {
    const redirectKey = buildRedirectKey(context);
    const displayedRedirectKey = buildDisplayedRedirectKey(context);
    const displayedRedirect = displayedBlockedScreenRedirects.get(context.tabId);
    if (
      displayedRedirect?.key === displayedRedirectKey &&
      Date.now() - displayedRedirect.redirectedAt < DUPLICATE_BLOCKED_SCREEN_REDIRECT_WINDOW_MS
    ) {
      return;
    }

    if (pendingBlockedScreenRedirects.has(redirectKey)) {
      return;
    }

    pendingBlockedScreenRedirects.add(redirectKey);
    try {
      if (await tabAlreadyShowsBlockedScreen(context)) {
        return;
      }

      if (optionsForRedirect.requireNativeConfirmation) {
        const confirmed = await options.confirmBlockedScreenNavigation?.(context);
        if (confirmed !== true) {
          return;
        }
      }

      if (optionsForRedirect.isCurrentNavigation?.() === false) {
        return;
      }

      if (optionsForRedirect.recordBlockedDomain) {
        logger.info(`[Monitor] Bloqueado por política nativa: ${context.hostname}`, {
          error: context.error,
        });
        options.addBlockedDomain(context.tabId, context.hostname, context.error, context.origin);
      }

      await options.redirectToBlockedScreen({
        tabId: context.tabId,
        hostname: context.hostname,
        error: context.error,
        origin: context.origin,
      });
      displayedBlockedScreenRedirects.set(context.tabId, {
        key: displayedRedirectKey,
        redirectedAt: Date.now(),
      });
    } catch (error) {
      logger.warn('[Monitor] No se pudo confirmar pantalla de bloqueo', {
        tabId: context.tabId,
        hostname: context.hostname,
        error: getErrorMessage(error),
      });
    } finally {
      pendingBlockedScreenRedirects.delete(redirectKey);
    }
  }

  function handleNativePolicyNavigationPreflight(details: {
    frameId: number;
    tabId: number;
    url: string;
  }): void {
    if (details.frameId !== 0 || isExtensionUrl(details.url)) {
      return;
    }

    const context = buildBlockedScreenContext({
      error: NATIVE_POLICY_BLOCKED_ERROR,
      tabId: details.tabId,
      url: details.url,
    });
    if (!context) {
      return;
    }

    latestNativePolicyPreflightByTab.set(context.tabId, context.url);
    void redirectToBlockedScreenOnce(context, {
      isCurrentNavigation: () =>
        latestNativePolicyPreflightByTab.get(context.tabId) === context.url,
      recordBlockedDomain: true,
      requireNativeConfirmation: true,
    });
  }

  function handleBlockedScreenNavigationError(
    details: {
      documentUrl?: string;
      error: string;
      frameId?: number;
      originUrl?: string;
      tabId: number;
      type?: string;
      url: string;
    },
    optionsForError: { recordBlockedDomain: boolean; requestType?: WebRequest.ResourceType }
  ): void {
    if (IGNORED_ERRORS.includes(details.error)) {
      return;
    }

    if (!BLOCKING_ERRORS.includes(details.error)) {
      return;
    }

    const context = buildBlockedScreenContext(details);
    if (!context) {
      return;
    }

    if (optionsForError.recordBlockedDomain) {
      logger.info(`[Monitor] Bloqueado: ${context.hostname}`, {
        error: details.error,
        requestType: optionsForError.requestType,
      });
      options.addBlockedDomain(
        details.tabId,
        context.hostname,
        details.error,
        details.originUrl ?? details.documentUrl
      );
    }

    if (shouldDisplayBlockedScreenImmediately(details)) {
      void redirectToBlockedScreenOnce(context, { requireNativeConfirmation: false });
    } else if (shouldConfirmBlockedScreenNavigation(details)) {
      void redirectToBlockedScreenOnce(context, { requireNativeConfirmation: true });
    }
  }

  async function resolveAutoAllowOriginPage(details: {
    documentUrl?: string;
    originUrl?: string;
    tabId: number;
    url: string;
  }): Promise<string | null> {
    const explicitOrigin = normalizeAutoAllowOriginCandidate(
      details.originUrl ?? details.documentUrl,
      details.url
    );
    if (explicitOrigin) {
      return explicitOrigin;
    }

    if (details.tabId < 0) {
      return null;
    }

    try {
      const tab = await options.browser.tabs.get(details.tabId);
      return normalizeAutoAllowOriginCandidate(tab.url, details.url);
    } catch {
      return null;
    }
  }

  function triggerAutoAllowForEligibleRequest(details: {
    documentUrl?: string;
    originUrl?: string;
    tabId: number;
    type?: WebRequest.ResourceType;
    url: string;
  }): void {
    const hostname = extractHostname(details.url);
    const requestType = details.type;
    if (
      !hostname ||
      details.tabId < 0 ||
      requestType === undefined ||
      !isAutoAllowRequestType(requestType)
    ) {
      return;
    }

    void resolveAutoAllowOriginPage(details).then((originPage) =>
      options.autoAllowBlockedDomain(details.tabId, hostname, originPage, requestType, details.url)
    );
  }

  options.browser.webRequest.onBeforeRequest.addListener(
    (details: WebRequest.OnBeforeRequestDetailsType) => {
      const result = options.evaluateBlockedPath(details);
      if (!result) {
        triggerAutoAllowForEligibleRequest(details);
        return;
      }

      const hostname = extractHostname(details.url) ?? 'dominio desconocido';
      if (details.tabId >= 0) {
        const reason = result.reason ?? `${ROUTE_BLOCK_REASON}:unknown`;
        options.addBlockedDomain(
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
    { urls: ['<all_urls>'] },
    ['blocking']
  );

  options.browser.webRequest.onErrorOccurred.addListener(
    (details: WebRequest.OnErrorOccurredDetailsType) => {
      const hostname = extractHostname(details.url);
      if (!hostname || details.tabId < 0) {
        return;
      }

      handleBlockedScreenNavigationError(details, {
        recordBlockedDomain: true,
        requestType: details.type,
      });

      triggerAutoAllowForEligibleRequest(details);
    },
    { urls: ['<all_urls>'] }
  );

  options.browser.webNavigation.onBeforeNavigate.addListener(
    (details: WebNavigation.OnBeforeNavigateDetailsType) => {
      handleNativePolicyNavigationPreflight({
        frameId: details.frameId,
        tabId: details.tabId,
        url: details.url,
      });

      if (
        shouldClearBlockedMonitorStateOnNavigate(
          { frameId: details.frameId, url: details.url },
          options.browser.runtime.getURL(BLOCKED_SCREEN_PATH)
        )
      ) {
        logger.debug(`[Monitor] Limpiando bloqueos para tab ${details.tabId.toString()}`);
        options.clearTabRuntimeState(details.tabId);
      }
    }
  );

  options.browser.webNavigation.onErrorOccurred.addListener(
    (details: WebNavigation.OnErrorOccurredDetailsType) => {
      const maybeError = (details as { error?: unknown }).error;
      if (typeof maybeError !== 'string' || maybeError.length === 0) {
        return;
      }

      handleBlockedScreenNavigationError(
        {
          error: maybeError,
          frameId: details.frameId,
          tabId: details.tabId,
          url: details.url,
        },
        {
          recordBlockedDomain: true,
        }
      );
    }
  );

  options.browser.tabs.onRemoved.addListener((tabId: number) => {
    latestNativePolicyPreflightByTab.delete(tabId);
    displayedBlockedScreenRedirects.delete(tabId);
    options.disposeTab(tabId);
    logger.debug(`[Monitor] Tab ${tabId.toString()} cerrada, datos eliminados`);
  });

  options.browser.runtime.onMessage.addListener(
    createRuntimeMessageResponder(options.handleRuntimeMessage)
  );
}
