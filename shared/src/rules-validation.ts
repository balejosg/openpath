/**
 * Rule value validation for domains, subdomains, and paths.
 *
 * This module provides server-side validation that mirrors the client-side
 * validation in react-spa/src/lib/ruleDetection.ts. Both MUST stay in sync.
 */

// =============================================================================
// Types
// =============================================================================

/** The three rule types supported by whitelist groups. */
export type RuleType = 'whitelist' | 'blocked_subdomain' | 'blocked_path';

/** Result of validating a rule value. */
export interface RuleValidationResult {
  valid: boolean;
  error?: string;
}

// =============================================================================
// Regex patterns (must match react-spa/src/lib/ruleDetection.ts)
// =============================================================================

// Domain validation: each label 1-63 chars (alphanumeric + hyphens, not at start/end),
// TLD 2-63 chars letters only. Does NOT allow wildcard prefix.
const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

// Same as DOMAIN_REGEX but optionally allows a "*." prefix for wildcard patterns
const SUBDOMAIN_REGEX =
  /^(?:\*\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

// Path characters: anything allowed after domain/ except whitespace and control chars
const PATH_SEGMENT_REGEX = /^[^\s]+$/;

// =============================================================================
// Cleaning / normalization
// =============================================================================

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
    cleaned = cleaned.replace(/\/$/, '');
  }

  return cleaned;
}

// =============================================================================
// Individual validators
// =============================================================================

/**
 * Validate that a domain string is well-formed.
 * Checks: length 4-253, no consecutive dots, each label <= 63 chars, matches DOMAIN_REGEX.
 */
function validateDomain(domain: string): RuleValidationResult {
  if (domain.length < 4) {
    return { valid: false, error: 'Domain too short (minimum 4 characters)' };
  }
  if (domain.length > 253) {
    return { valid: false, error: 'Domain exceeds maximum length of 253 characters' };
  }
  if (domain.includes('..')) {
    return { valid: false, error: 'Domain cannot contain consecutive dots (..)' };
  }
  if (!DOMAIN_REGEX.test(domain)) {
    return {
      valid: false,
      error: 'Invalid domain format. Example: example.com',
    };
  }
  // Validate each label length
  const labels = domain.split('.');
  for (const label of labels) {
    if (label.length > 63) {
      return { valid: false, error: 'Each domain label must be 63 characters or less' };
    }
  }
  return { valid: true };
}

/**
 * Validate that a subdomain pattern is well-formed.
 * Accepts: domain.tld, sub.domain.tld, *.domain.tld
 */
function validateSubdomain(value: string): RuleValidationResult {
  if (value.length < 4) {
    return { valid: false, error: 'Subdomain too short (minimum 4 characters)' };
  }
  if (value.length > 253) {
    return { valid: false, error: 'Subdomain exceeds maximum length of 253 characters' };
  }
  if (value.includes('..')) {
    return { valid: false, error: 'Subdomain cannot contain consecutive dots (..)' };
  }
  if (!SUBDOMAIN_REGEX.test(value)) {
    return {
      valid: false,
      error: 'Invalid subdomain format. Example: sub.example.com or *.example.com',
    };
  }
  // Validate each label length (skip wildcard)
  const labels = value.replace(/^\*\./, '').split('.');
  for (const label of labels) {
    if (label.length > 63) {
      return {
        valid: false,
        error: 'Each subdomain label must be 63 characters or less',
      };
    }
  }
  return { valid: true };
}

/**
 * Validate that a blocked path is well-formed.
 * Must be domain/path where domain is valid and path is non-empty.
 */
function validatePath(value: string): RuleValidationResult {
  const slashIndex = value.indexOf('/');
  if (slashIndex === -1) {
    return {
      valid: false,
      error: 'Path must contain a slash (/). Example: example.com/path',
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
        error: `Invalid domain in path: ${domainResult.error ?? ''}`,
      };
    }
  }

  if (!pathPart) {
    return { valid: false, error: 'Path after domain cannot be empty' };
  }

  if (!PATH_SEGMENT_REGEX.test(pathPart)) {
    return { valid: false, error: 'Path contains invalid characters (whitespace)' };
  }

  return { valid: true };
}

// =============================================================================
// Main validation dispatcher
// =============================================================================

/**
 * Validate a rule value based on its type.
 * Cleans the value first, then applies type-specific format validation.
 *
 * @param value - The raw input value
 * @param type - The rule type (whitelist, blocked_subdomain, blocked_path)
 * @returns Validation result with optional error message
 */
export function validateRuleValue(value: string, type: RuleType): RuleValidationResult {
  const cleaned =
    type === 'blocked_path' ? cleanRuleValue(value, true) : cleanRuleValue(value, false);

  if (!cleaned) {
    return { valid: false, error: 'Value cannot be empty' };
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
