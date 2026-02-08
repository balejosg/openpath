/**
 * Rule Detection - Automatically detect rule type based on input pattern
 */

export type RuleType = 'whitelist' | 'blocked_subdomain' | 'blocked_path';

export interface DetectionResult {
  type: RuleType;
  cleanedValue: string;
  confidence: 'high' | 'medium';
  reason: string;
}

/**
 * Clean and normalize a rule value.
 * Strips protocol, trailing slashes (for domains), and lowercases.
 */
export function cleanRuleValue(value: string, preservePath = false): string {
  let cleaned = value.trim().toLowerCase();

  // Remove protocol
  cleaned = cleaned.replace(/^https?:\/\//, '');
  cleaned = cleaned.replace(/^\*:\/\//, '');

  // Remove trailing slash if it's just a domain (no path content after /)
  if (!preservePath) {
    // If ends with just "/" and nothing after, remove it
    cleaned = cleaned.replace(/\/$/, '');
  }

  return cleaned;
}

/**
 * Extract the root domain from a domain string.
 * e.g., "ads.google.com" -> "google.com"
 *       "*.tracking.example.com" -> "example.com"
 */
export function extractRootDomain(domain: string): string {
  // Remove wildcard prefix
  const cleanDomain = domain.replace(/^\*\./, '');

  // Split and take last 2 parts
  const parts = cleanDomain.split('.');
  if (parts.length <= 2) {
    return cleanDomain;
  }

  return parts.slice(-2).join('.');
}

/**
 * Detect the rule type based on the input pattern and existing whitelist domains.
 *
 * @param value - The raw input value
 * @param existingWhitelistDomains - Array of domains already in the whitelist
 * @returns Detection result with type, cleaned value, confidence, and reason
 */
export function detectRuleType(
  value: string,
  existingWhitelistDomains: string[] = []
): DetectionResult {
  const cleaned = cleanRuleValue(value, true);

  // Rule 1: Contains "/" -> it's a path rule
  if (cleaned.includes('/')) {
    return {
      type: 'blocked_path',
      cleanedValue: cleaned,
      confidence: 'high',
      reason: 'Contiene una ruta (/)',
    };
  }

  // Now we know it's a domain-only value
  const domainCleaned = cleanRuleValue(value, false);
  const rootDomain = extractRootDomain(domainCleaned);

  // Rule 2: If the root domain is already in whitelist AND this is a subdomain -> blocked_subdomain
  const normalizedExisting = existingWhitelistDomains.map((d) => d.toLowerCase());

  if (normalizedExisting.includes(rootDomain) && domainCleaned !== rootDomain) {
    return {
      type: 'blocked_subdomain',
      cleanedValue: domainCleaned,
      confidence: 'high',
      reason: `"${rootDomain}" ya está permitido, se bloqueará este subdominio`,
    };
  }

  // Rule 3: Starts with "*." -> likely a subdomain block pattern
  if (domainCleaned.startsWith('*.')) {
    const baseDomain = domainCleaned.slice(2);
    const baseRoot = extractRootDomain(baseDomain);

    if (normalizedExisting.includes(baseRoot)) {
      return {
        type: 'blocked_subdomain',
        cleanedValue: domainCleaned,
        confidence: 'high',
        reason: `Patrón wildcard para bloquear subdominios de "${baseRoot}"`,
      };
    }

    // Wildcard without matching whitelist - still suggest as subdomain block
    return {
      type: 'blocked_subdomain',
      cleanedValue: domainCleaned,
      confidence: 'medium',
      reason: 'Patrón wildcard detectado',
    };
  }

  // Rule 4: Looks like a subdomain (3+ parts) and root is whitelisted
  const parts = domainCleaned.split('.');
  if (parts.length >= 3 && normalizedExisting.includes(rootDomain)) {
    return {
      type: 'blocked_subdomain',
      cleanedValue: domainCleaned,
      confidence: 'high',
      reason: `"${rootDomain}" ya está permitido, se bloqueará este subdominio`,
    };
  }

  // Default: treat as whitelist domain
  return {
    type: 'whitelist',
    cleanedValue: domainCleaned,
    confidence: 'high',
    reason: 'Dominio para añadir a la lista blanca',
  };
}

/**
 * Get a human-readable label for a rule type.
 */
export function getRuleTypeLabel(type: RuleType): string {
  switch (type) {
    case 'whitelist':
      return 'Dominio permitido';
    case 'blocked_subdomain':
      return 'Subdominio bloqueado';
    case 'blocked_path':
      return 'Ruta bloqueada';
  }
}

/**
 * Get a short badge label for a rule type.
 */
export function getRuleTypeBadge(type: RuleType): string {
  switch (type) {
    case 'whitelist':
      return 'Permitido';
    case 'blocked_subdomain':
      return 'Sub. bloq.';
    case 'blocked_path':
      return 'Ruta bloq.';
  }
}

/**
 * Categorize a rule as 'allowed' or 'blocked' for filtering.
 */
export function categorizeRule(type: RuleType): 'allowed' | 'blocked' {
  return type === 'whitelist' ? 'allowed' : 'blocked';
}
