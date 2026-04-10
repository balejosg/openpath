export interface BlockedDomainSubmitInput {
  domain: string;
  reason: string;
  token: string;
  hostname: string;
  clientVersion: string;
  origin?: string | undefined;
  error?: string | undefined;
}

export function buildBlockedDomainSubmitBody(
  input: BlockedDomainSubmitInput
): Record<string, string> {
  const body: Record<string, string> = {
    domain: input.domain,
    reason: input.reason,
    token: input.token,
    hostname: input.hostname,
    client_version: input.clientVersion,
  };

  if (input.origin?.trim()) {
    body.origin_host = input.origin.trim();
  }

  if (input.error?.trim()) {
    body.error_type = input.error.trim();
  }

  return body;
}
