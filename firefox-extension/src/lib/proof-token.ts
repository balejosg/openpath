function toBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    return btoa(String.fromCharCode(...bytes));
  }

  return Buffer.from(bytes).toString('base64');
}

export async function generateProofToken(hostname: string, secret: string): Promise<string> {
  const data = new TextEncoder().encode(hostname + secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return toBase64(new Uint8Array(hashBuffer));
}
