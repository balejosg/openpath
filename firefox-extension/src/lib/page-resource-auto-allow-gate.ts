import type { Runtime, WebRequest } from 'webextension-polyfill';
import {
  buildAutoAllowCandidateFromMessage,
  buildAutoAllowCandidateFromWebRequest,
} from './page-resource-auto-allow-intake.js';

export const AUTO_ALLOW_BEFORE_REQUEST_TIMEOUT_MS = 10_000;

export interface PageResourceAutoAllowGateDeps {
  autoAllowBeforeRequestTimeoutMs?: number;
  autoAllowBlockedDomain: (
    tabId: number,
    hostname: string,
    origin: string | null,
    requestType: WebRequest.ResourceType,
    targetUrl: string
  ) => Promise<void>;
  getTabUrl: (tabId: number) => Promise<string | null | undefined>;
  onBackgroundAutoAllowError?: (error: unknown) => void;
}

export interface PageResourceAutoAllowGate {
  handlePageResourceCandidateMessage: (
    message: unknown,
    sender: Runtime.MessageSender
  ) => Promise<{ error?: string; success: boolean }>;
  isBlockingAutoAllowResource: (details: { frameId?: number; type?: string }) => boolean;
  triggerAutoAllowForEligibleRequest: (details: {
    documentUrl?: string;
    originUrl?: string;
    tabId: number;
    type?: WebRequest.ResourceType;
    url: string;
  }) => Promise<void>;
  triggerAutoAllowForEligibleRequestInBackground: (details: {
    documentUrl?: string;
    originUrl?: string;
    tabId: number;
    type?: WebRequest.ResourceType;
    url: string;
  }) => void;
  waitForAutoAllowBeforeRequest: (details: {
    documentUrl?: string;
    originUrl?: string;
    tabId: number;
    type?: WebRequest.ResourceType;
    url: string;
  }) => Promise<WebRequest.BlockingResponse>;
}

function isTopFrameNavigation(details: { frameId?: number; type?: string }): boolean {
  if (details.type !== undefined) {
    return details.type === 'main_frame';
  }

  return details.frameId === 0;
}

export function createPageResourceAutoAllowGate(
  deps: PageResourceAutoAllowGateDeps
): PageResourceAutoAllowGate {
  const autoAllowBeforeRequestTimeoutMs =
    deps.autoAllowBeforeRequestTimeoutMs ?? AUTO_ALLOW_BEFORE_REQUEST_TIMEOUT_MS;

  function handlePageResourceCandidateMessage(
    message: unknown,
    sender: Runtime.MessageSender
  ): Promise<{ error?: string; success: boolean }> {
    const parsed = buildAutoAllowCandidateFromMessage(message, sender);
    if (!parsed.ok) {
      return Promise.resolve({ success: false, error: parsed.error });
    }

    void deps
      .autoAllowBlockedDomain(
        parsed.candidate.tabId,
        parsed.candidate.hostname,
        parsed.candidate.originPage,
        parsed.candidate.requestType,
        parsed.candidate.targetUrl
      )
      .catch((error: unknown) => {
        deps.onBackgroundAutoAllowError?.(error);
      });
    return Promise.resolve({ success: true });
  }

  async function triggerAutoAllowForEligibleRequest(details: {
    documentUrl?: string;
    originUrl?: string;
    tabId: number;
    type?: WebRequest.ResourceType;
    url: string;
  }): Promise<void> {
    const result = await buildAutoAllowCandidateFromWebRequest(details, {
      getTabUrl: deps.getTabUrl,
    });
    if (!result.ok) {
      return;
    }

    const { candidate } = result;
    await deps.autoAllowBlockedDomain(
      candidate.tabId,
      candidate.hostname,
      candidate.originPage,
      candidate.requestType,
      candidate.targetUrl
    );
  }

  function triggerAutoAllowForEligibleRequestInBackground(details: {
    documentUrl?: string;
    originUrl?: string;
    tabId: number;
    type?: WebRequest.ResourceType;
    url: string;
  }): void {
    void triggerAutoAllowForEligibleRequest(details);
  }

  function waitForAutoAllowBeforeRequest(details: {
    documentUrl?: string;
    originUrl?: string;
    tabId: number;
    type?: WebRequest.ResourceType;
    url: string;
  }): Promise<WebRequest.BlockingResponse> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({});
      }, autoAllowBeforeRequestTimeoutMs);
      void triggerAutoAllowForEligibleRequest(details).finally(() => {
        clearTimeout(timeout);
        resolve({});
      });
    });
  }

  return {
    handlePageResourceCandidateMessage,
    isBlockingAutoAllowResource: (details) => !isTopFrameNavigation(details),
    triggerAutoAllowForEligibleRequest,
    triggerAutoAllowForEligibleRequestInBackground,
    waitForAutoAllowBeforeRequest,
  };
}
