import { describe, it, expect } from 'vitest';
import {
  cleanRuleValue,
  extractRootDomain,
  detectRuleType,
  getRuleTypeLabel,
  getRuleTypeBadge,
  categorizeRule,
} from '../ruleDetection';

describe('ruleDetection', () => {
  describe('cleanRuleValue', () => {
    it('removes https protocol', () => {
      expect(cleanRuleValue('https://google.com')).toBe('google.com');
    });

    it('removes http protocol', () => {
      expect(cleanRuleValue('http://google.com')).toBe('google.com');
    });

    it('removes wildcard protocol', () => {
      expect(cleanRuleValue('*://google.com')).toBe('google.com');
    });

    it('lowercases the value', () => {
      expect(cleanRuleValue('Google.COM')).toBe('google.com');
    });

    it('trims whitespace', () => {
      expect(cleanRuleValue('  google.com  ')).toBe('google.com');
    });

    it('removes trailing slash for domains', () => {
      expect(cleanRuleValue('google.com/')).toBe('google.com');
    });

    it('preserves path when preservePath is true', () => {
      expect(cleanRuleValue('https://google.com/path', true)).toBe('google.com/path');
    });

    it('preserves trailing slash in paths', () => {
      expect(cleanRuleValue('google.com/path/', true)).toBe('google.com/path/');
    });
  });

  describe('extractRootDomain', () => {
    it('returns same domain for 2-part domain', () => {
      expect(extractRootDomain('google.com')).toBe('google.com');
    });

    it('extracts root from subdomain', () => {
      expect(extractRootDomain('ads.google.com')).toBe('google.com');
    });

    it('extracts root from deep subdomain', () => {
      expect(extractRootDomain('a.b.c.google.com')).toBe('google.com');
    });

    it('handles wildcard prefix', () => {
      expect(extractRootDomain('*.google.com')).toBe('google.com');
    });

    it('handles wildcard with subdomain', () => {
      expect(extractRootDomain('*.tracking.google.com')).toBe('google.com');
    });
  });

  describe('detectRuleType', () => {
    describe('path detection', () => {
      it('detects path rule when value contains /', () => {
        const result = detectRuleType('facebook.com/gaming');
        expect(result.type).toBe('blocked_path');
        expect(result.cleanedValue).toBe('facebook.com/gaming');
        expect(result.confidence).toBe('high');
      });

      it('detects global path rule', () => {
        const result = detectRuleType('*/ads/*');
        expect(result.type).toBe('blocked_path');
        expect(result.cleanedValue).toBe('*/ads/*');
      });

      it('strips protocol from path rules', () => {
        const result = detectRuleType('https://facebook.com/gaming');
        expect(result.type).toBe('blocked_path');
        expect(result.cleanedValue).toBe('facebook.com/gaming');
      });
    });

    describe('subdomain detection with existing whitelist', () => {
      const existingWhitelist = ['google.com', 'facebook.com'];

      it('detects subdomain block when root is whitelisted', () => {
        const result = detectRuleType('ads.google.com', existingWhitelist);
        expect(result.type).toBe('blocked_subdomain');
        expect(result.confidence).toBe('high');
        expect(result.reason).toContain('google.com');
      });

      it('detects deep subdomain block', () => {
        const result = detectRuleType('tracking.ads.google.com', existingWhitelist);
        expect(result.type).toBe('blocked_subdomain');
      });

      it('detects wildcard subdomain block', () => {
        const result = detectRuleType('*.tracking.google.com', existingWhitelist);
        expect(result.type).toBe('blocked_subdomain');
        expect(result.confidence).toBe('high');
      });
    });

    describe('wildcard without existing whitelist', () => {
      it('suggests subdomain block for wildcard pattern', () => {
        const result = detectRuleType('*.example.com', []);
        expect(result.type).toBe('blocked_subdomain');
        expect(result.confidence).toBe('medium');
      });
    });

    describe('whitelist domain detection', () => {
      it('detects new domain as whitelist', () => {
        const result = detectRuleType('wikipedia.org', []);
        expect(result.type).toBe('whitelist');
        expect(result.confidence).toBe('high');
      });

      it('detects domain as whitelist even with existing domains', () => {
        const result = detectRuleType('wikipedia.org', ['google.com']);
        expect(result.type).toBe('whitelist');
      });

      it('strips protocol for whitelist domains', () => {
        const result = detectRuleType('https://wikipedia.org', []);
        expect(result.type).toBe('whitelist');
        expect(result.cleanedValue).toBe('wikipedia.org');
      });

      it('handles root domain that matches existing', () => {
        // If google.com is already whitelisted and user types google.com again
        const result = detectRuleType('google.com', ['google.com']);
        expect(result.type).toBe('whitelist'); // Still whitelist, duplicate check is elsewhere
      });
    });

    describe('edge cases', () => {
      it('handles empty existing whitelist', () => {
        const result = detectRuleType('example.com', []);
        expect(result.type).toBe('whitelist');
      });

      it('handles case-insensitive matching', () => {
        const result = detectRuleType('ADS.GOOGLE.COM', ['google.com']);
        expect(result.type).toBe('blocked_subdomain');
      });

      it('handles mixed case in existing whitelist', () => {
        const result = detectRuleType('ads.google.com', ['GOOGLE.COM']);
        expect(result.type).toBe('blocked_subdomain');
      });
    });
  });

  describe('getRuleTypeLabel', () => {
    it('returns correct label for whitelist', () => {
      expect(getRuleTypeLabel('whitelist')).toBe('Dominio permitido');
    });

    it('returns correct label for blocked_subdomain', () => {
      expect(getRuleTypeLabel('blocked_subdomain')).toBe('Subdominio bloqueado');
    });

    it('returns correct label for blocked_path', () => {
      expect(getRuleTypeLabel('blocked_path')).toBe('Ruta bloqueada');
    });
  });

  describe('getRuleTypeBadge', () => {
    it('returns short badge for whitelist', () => {
      expect(getRuleTypeBadge('whitelist')).toBe('Permitido');
    });

    it('returns short badge for blocked_subdomain', () => {
      expect(getRuleTypeBadge('blocked_subdomain')).toBe('Sub. bloq.');
    });

    it('returns short badge for blocked_path', () => {
      expect(getRuleTypeBadge('blocked_path')).toBe('Ruta bloq.');
    });
  });

  describe('categorizeRule', () => {
    it('categorizes whitelist as allowed', () => {
      expect(categorizeRule('whitelist')).toBe('allowed');
    });

    it('categorizes blocked_subdomain as blocked', () => {
      expect(categorizeRule('blocked_subdomain')).toBe('blocked');
    });

    it('categorizes blocked_path as blocked', () => {
      expect(categorizeRule('blocked_path')).toBe('blocked');
    });
  });
});
