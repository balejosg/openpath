import type { WebRequest } from 'webextension-polyfill';
import { extractHostname } from './path-blocking.js';

export type PageResourceKind =
  | 'fetch'
  | 'xmlhttprequest'
  | 'image'
  | 'script'
  | 'stylesheet'
  | 'other';

export interface PageResourceCandidateMessage {
  action: 'openpathPageResourceCandidate';
  kind: PageResourceKind;
  pageUrl: string;
  resourceUrl: string;
}

export interface ParsedPageResourceCandidate {
  hostname: string;
  originPage: string | null;
  requestType: WebRequest.ResourceType;
  tabId: number;
  targetUrl: string;
}

export type PageResourceCandidateParseResult =
  | { ok: true; candidate: ParsedPageResourceCandidate }
  | { ok: false; error: string };

export function buildPageResourceCandidateMessage(
  pageUrl: string,
  resourceUrl: string,
  kind: PageResourceKind
): PageResourceCandidateMessage {
  return {
    action: 'openpathPageResourceCandidate',
    kind,
    pageUrl,
    resourceUrl,
  };
}

export function isPageResourceCandidateMessage(message: unknown): message is {
  action: 'openpathPageResourceCandidate';
  kind?: unknown;
  pageUrl?: unknown;
  resourceUrl?: unknown;
  tabId?: unknown;
} {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { action?: unknown }).action === 'openpathPageResourceCandidate'
  );
}

export function pageResourceKindToRequestType(kind: unknown): WebRequest.ResourceType {
  switch (kind) {
    case 'fetch':
    case 'xmlhttprequest':
      return 'xmlhttprequest';
    case 'image':
    case 'script':
    case 'stylesheet':
      return kind;
    default:
      return 'other';
  }
}

export function parsePageResourceCandidateMessage(
  message: unknown,
  sender: { senderTabId?: number | undefined; senderTabUrl?: string | null | undefined }
): PageResourceCandidateParseResult {
  if (!isPageResourceCandidateMessage(message) || typeof message.resourceUrl !== 'string') {
    return { ok: false, error: 'resourceUrl is required' };
  }

  const hostname = extractHostname(message.resourceUrl);
  if (!hostname) {
    return { ok: false, error: 'resourceUrl is required' };
  }

  const tabId =
    typeof sender.senderTabId === 'number'
      ? sender.senderTabId
      : typeof message.tabId === 'number'
        ? message.tabId
        : -1;
  const originPage =
    typeof message.pageUrl === 'string' && message.pageUrl.length > 0
      ? message.pageUrl
      : (sender.senderTabUrl ?? null);

  return {
    ok: true,
    candidate: {
      hostname,
      originPage,
      requestType: pageResourceKindToRequestType(message.kind),
      tabId,
      targetUrl: message.resourceUrl,
    },
  };
}
