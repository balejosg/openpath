import { createHash, timingSafeEqual } from 'node:crypto';

export function normalizeHostInput(value: string): string {
  return value.trim().toLowerCase();
}

export function computeMachineProofToken(hostname: string, secret: string): string {
  return createHash('sha256')
    .update(hostname + secret)
    .digest('base64');
}

export function isValidMachineProofToken(hostname: string, token: string, secret: string): boolean {
  const expected = computeMachineProofToken(hostname, secret);

  if (token.length !== expected.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}
