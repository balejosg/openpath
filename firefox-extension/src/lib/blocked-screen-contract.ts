export const SUBMIT_BLOCKED_DOMAIN_REQUEST_ACTION = 'submitBlockedDomainRequest' as const;

export interface BlockedScreenContext {
  blockedDomain: string;
  error: string;
  origin: string | null;
  displayOrigin: string;
}

export interface SubmitBlockedDomainRequestMessageInput {
  domain: string;
  reason: string;
  origin?: string | null | undefined;
  error?: string | null | undefined;
}

export interface SubmitBlockedDomainRequestMessage {
  action: typeof SUBMIT_BLOCKED_DOMAIN_REQUEST_ACTION;
  domain: string;
  reason: string;
  origin?: string | undefined;
  error?: string | undefined;
}

function getSearchParam(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  return value && value.trim().length > 0 ? value : null;
}

function extractDomainFromUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).hostname || null;
  } catch {
    return null;
  }
}

function normalizeOptionalValue(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

export function buildBlockedScreenContextFromSearch(search: string): BlockedScreenContext {
  const params = new URLSearchParams(search);
  const blockedUrl = getSearchParam(params, 'blockedUrl');
  const queryDomain = getSearchParam(params, 'domain');
  const origin = getSearchParam(params, 'origin');

  return {
    blockedDomain: queryDomain ?? extractDomainFromUrl(blockedUrl) ?? 'dominio desconocido',
    error: getSearchParam(params, 'error') ?? 'bloqueo de red/politica',
    origin,
    displayOrigin: origin ?? 'sin informacion',
  };
}

export function buildSubmitBlockedDomainRequestMessage(
  input: SubmitBlockedDomainRequestMessageInput
): SubmitBlockedDomainRequestMessage {
  const message: SubmitBlockedDomainRequestMessage = {
    action: SUBMIT_BLOCKED_DOMAIN_REQUEST_ACTION,
    domain: input.domain,
    reason: input.reason,
  };

  const origin = normalizeOptionalValue(input.origin);
  if (origin) {
    message.origin = origin;
  }

  const error = normalizeOptionalValue(input.error);
  if (error) {
    message.error = error;
  }

  return message;
}

export function isSubmitBlockedDomainRequestMessage(
  message: unknown
): message is SubmitBlockedDomainRequestMessage {
  const record = message as Partial<SubmitBlockedDomainRequestMessage> | null;
  return (
    typeof record === 'object' &&
    record !== null &&
    record.action === SUBMIT_BLOCKED_DOMAIN_REQUEST_ACTION &&
    typeof record.domain === 'string' &&
    typeof record.reason === 'string' &&
    isOptionalString(record.origin) &&
    isOptionalString(record.error)
  );
}
