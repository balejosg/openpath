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

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Domain validation: each label 1-63 chars (alphanumeric + hyphens, not at start/end),
// TLD 2-63 chars letters only. Does NOT allow wildcard prefix.
const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

// Same as DOMAIN_REGEX but optionally allows a "*." prefix for wildcard patterns
const SUBDOMAIN_REGEX =
  /^(?:\*\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

// Path characters: anything allowed after domain/ except whitespace and control chars
const PATH_SEGMENT_REGEX = /^[^\s]+$/;

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
 * Validate that a domain string is well-formed.
 * Checks: length 4-253, no consecutive dots, each label <= 63 chars, matches DOMAIN_REGEX.
 */
function validateDomain(domain: string): ValidationResult {
  if (domain.length < 4) {
    return { valid: false, error: 'El dominio es demasiado corto (mínimo 4 caracteres)' };
  }
  if (domain.length > 253) {
    return { valid: false, error: 'El dominio excede los 253 caracteres permitidos' };
  }
  if (domain.includes('..')) {
    return { valid: false, error: 'El dominio no puede contener puntos consecutivos (..)' };
  }
  if (!DOMAIN_REGEX.test(domain)) {
    return {
      valid: false,
      error: 'Formato de dominio inválido. Ejemplo válido: example.com',
    };
  }
  // Validate each label length
  const labels = domain.split('.');
  for (const label of labels) {
    if (label.length > 63) {
      return { valid: false, error: 'Cada parte del dominio debe tener como máximo 63 caracteres' };
    }
  }
  return { valid: true };
}

/**
 * Validate that a subdomain pattern is well-formed.
 * Accepts: domain.tld, sub.domain.tld, *.domain.tld
 */
function validateSubdomain(value: string): ValidationResult {
  if (value.length < 4) {
    return { valid: false, error: 'El subdominio es demasiado corto (mínimo 4 caracteres)' };
  }
  if (value.length > 253) {
    return { valid: false, error: 'El subdominio excede los 253 caracteres permitidos' };
  }
  if (value.includes('..')) {
    return { valid: false, error: 'El subdominio no puede contener puntos consecutivos (..)' };
  }
  if (!SUBDOMAIN_REGEX.test(value)) {
    return {
      valid: false,
      error: 'Formato de subdominio inválido. Ejemplo válido: sub.example.com o *.example.com',
    };
  }
  // Validate each label length (skip wildcard)
  const labels = value.replace(/^\*\./, '').split('.');
  for (const label of labels) {
    if (label.length > 63) {
      return {
        valid: false,
        error: 'Cada parte del subdominio debe tener como máximo 63 caracteres',
      };
    }
  }
  return { valid: true };
}

/**
 * Validate that a blocked path is well-formed.
 * Must be domain/path where domain is valid and path is non-empty.
 */
function validatePath(value: string): ValidationResult {
  const slashIndex = value.indexOf('/');
  if (slashIndex === -1) {
    return {
      valid: false,
      error: 'La ruta debe contener una barra (/). Ejemplo: example.com/path',
    };
  }

  const domainPart = value.substring(0, slashIndex);
  const pathPart = value.substring(slashIndex + 1);

  // Allow global wildcard paths like */ads/*
  if (domainPart !== '*') {
    // Validate domain part
    const domainResult = validateDomain(domainPart);
    if (!domainResult.valid) {
      return {
        valid: false,
        error: `Dominio inválido en la ruta: ${domainResult.error}`,
      };
    }
  }

  if (!pathPart) {
    return { valid: false, error: 'La ruta después del dominio no puede estar vacía' };
  }

  if (!PATH_SEGMENT_REGEX.test(pathPart)) {
    return { valid: false, error: 'La ruta contiene caracteres no permitidos (espacios)' };
  }

  return { valid: true };
}

/**
 * Validate a rule value based on its detected type.
 * Applies format validation for domains, subdomains, and paths.
 *
 * @param value - The raw input value
 * @param type - The detected rule type
 * @returns Validation result with optional error message
 */
export function validateRuleValue(value: string, type: RuleType): ValidationResult {
  const cleaned =
    type === 'blocked_path' ? cleanRuleValue(value, true) : cleanRuleValue(value, false);

  if (!cleaned) {
    return { valid: false, error: 'El valor no puede estar vacío' };
  }

  switch (type) {
    case 'whitelist':
      return validateDomain(cleaned);
    case 'blocked_subdomain':
      return validateSubdomain(cleaned);
    case 'blocked_path':
      return validatePath(cleaned);
  }
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
