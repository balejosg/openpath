/**
 * Rule Detection - Automatically detect rule type based on input pattern
 */

import { getRootDomain } from '@openpath/shared/domain';
import {
  cleanRuleValue as cleanRuleValueShared,
  validateRuleValue as validateRuleValueShared,
} from '@openpath/shared/rules-validation';
import type {
  RuleValidationCode,
  RuleValidationResult as SharedRuleValidationResult,
} from '@openpath/shared/rules-validation';

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

/**
 * Clean and normalize a rule value.
 * Strips protocol, trailing slashes (for domains), and lowercases.
 */
export function cleanRuleValue(value: string, preservePath = false): string {
  return cleanRuleValueShared(value, preservePath);
}

/**
 * Extract the root domain from a domain string.
 * e.g., "ads.google.com" -> "google.com"
 *       "*.tracking.example.com" -> "example.com"
 */
export function extractRootDomain(domain: string): string {
  return getRootDomain(domain);
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

// =============================================================================
// Validation (canonical logic in @openpath/shared, UI messages in Spanish)
// =============================================================================

const SPANISH_VALIDATION_MESSAGES: Partial<Record<RuleValidationCode, string>> = {
  EMPTY: 'El valor no puede estar vacío',

  DOMAIN_TOO_SHORT: 'El dominio es demasiado corto (mínimo 4 caracteres)',
  DOMAIN_TOO_LONG: 'El dominio excede los 253 caracteres permitidos',
  DOMAIN_CONSECUTIVE_DOTS: 'El dominio no puede contener puntos consecutivos (..)',
  DOMAIN_INVALID_FORMAT: 'Formato de dominio inválido. Ejemplo válido: example.com',
  DOMAIN_LABEL_TOO_LONG: 'Cada parte del dominio debe tener como máximo 63 caracteres',

  SUBDOMAIN_TOO_SHORT: 'El subdominio es demasiado corto (mínimo 4 caracteres)',
  SUBDOMAIN_TOO_LONG: 'El subdominio excede los 253 caracteres permitidos',
  SUBDOMAIN_CONSECUTIVE_DOTS: 'El subdominio no puede contener puntos consecutivos (..)',
  SUBDOMAIN_INVALID_FORMAT:
    'Formato de subdominio inválido. Ejemplo válido: sub.example.com o *.example.com',
  SUBDOMAIN_LABEL_TOO_LONG: 'Cada parte del subdominio debe tener como máximo 63 caracteres',

  PATH_MISSING_SLASH: 'La ruta debe contener una barra (/). Ejemplo: example.com/path',
  PATH_EMPTY: 'La ruta después del dominio no puede estar vacía',
  PATH_INVALID_CHARS: 'La ruta contiene caracteres no permitidos (espacios)',
};

function toSpanishRuleValidationError(result: SharedRuleValidationResult): string {
  if (result.code === 'PATH_INVALID_DOMAIN') {
    const domainCode = result.details?.domainCode;
    const domainError =
      (domainCode !== undefined ? SPANISH_VALIDATION_MESSAGES[domainCode] : undefined) ??
      result.details?.domainError ??
      '';
    return `Dominio inválido en la ruta: ${domainError}`;
  }

  if (result.code !== undefined) {
    const message = SPANISH_VALIDATION_MESSAGES[result.code];
    if (message) {
      return message;
    }
  }

  return result.error ?? 'Formato inválido';
}

/**
 * Validate a rule value based on its detected type.
 * Applies format validation for domains, subdomains, and paths.
 */
export function validateRuleValue(value: string, type: RuleType): ValidationResult {
  const result = validateRuleValueShared(value, type);
  if (result.valid) {
    return { valid: true };
  }
  return { valid: false, error: toSpanishRuleValidationError(result) };
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
