import { cleanRuleValue, validateRuleValue } from '@openpath/shared';

export interface AutoRequestInput {
  domainRaw: string;
  hostnameRaw: string;
  token: string;
  originPageRaw: string;
  reasonRaw: string;
}

export interface SubmitRequestInput {
  domainRaw: string;
  hostnameRaw: string;
  token: string;
  reasonRaw: string;
  originHostRaw: string;
  originPageRaw: string;
  clientVersionRaw: string;
  errorTypeRaw: string;
}

export type WhitelistDomainParseResult =
  | { ok: true; domain: string }
  | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
}

function getStringField(rec: Record<string, unknown>, key: string): string {
  const value = rec[key];
  return typeof value === 'string' ? value : '';
}

function getFirstStringField(rec: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return '';
}

export function parseAutoRequestPayload(body: unknown): AutoRequestInput {
  const rec = asRecord(body);

  return {
    domainRaw: getStringField(rec, 'domain'),
    hostnameRaw: getStringField(rec, 'hostname'),
    token: getStringField(rec, 'token'),
    originPageRaw: getFirstStringField(rec, ['origin_page', 'originPage']),
    reasonRaw: getStringField(rec, 'reason').trim(),
  };
}

export function parseSubmitRequestPayload(body: unknown): SubmitRequestInput {
  const rec = asRecord(body);

  return {
    domainRaw: getStringField(rec, 'domain'),
    hostnameRaw: getStringField(rec, 'hostname'),
    token: getStringField(rec, 'token'),
    reasonRaw: getStringField(rec, 'reason').trim(),
    originHostRaw: getFirstStringField(rec, ['origin_host', 'originHost']),
    originPageRaw: getFirstStringField(rec, ['origin_page', 'originPage']),
    clientVersionRaw: getFirstStringField(rec, ['client_version', 'clientVersion']),
    errorTypeRaw: getFirstStringField(rec, ['error_type', 'errorType']),
  };
}

export function parseWhitelistDomain(domainRaw: string): WhitelistDomainParseResult {
  const normalizedDomain = cleanRuleValue(domainRaw, false);
  if (!normalizedDomain) {
    return { ok: false, error: 'Domain is required' };
  }

  const validation = validateRuleValue(normalizedDomain, 'whitelist');
  if (!validation.valid) {
    return { ok: false, error: validation.error ?? 'Invalid domain format' };
  }

  return { ok: true, domain: normalizedDomain };
}
