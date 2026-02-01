import { describe, it, expect } from 'vitest';
import { whitelistParser } from '../openpath-parser';
import { GroupData } from '../../types';

describe('WhitelistParser', () => {
    describe('parse()', () => {
        it('should parse simple whitelist', () => {
            const content = `
                ## WHITELIST
                google.com
                github.com
            `;
            const result = whitelistParser.parse(content);
            expect(result.enabled).toBe(true);
            expect(result.whitelist).toEqual(['google.com', 'github.com']);
            expect(result.blockedSubdomains).toEqual([]);
        });

        it('should handle #DESACTIVADO marker', () => {
            const content = `
                #DESACTIVADO
                ## WHITELIST
                google.com
            `;
            const result = whitelistParser.parse(content);
            expect(result.enabled).toBe(false);
            expect(result.whitelist).toEqual(['google.com']);
        });

        it('should parse all sections', () => {
            const content = `
                ## WHITELIST
                google.com
                
                ## BLOCKED-SUBDOMAINS
                ads.google.com
                
                ## BLOCKED-PATHS
                */ads/*
            `;
            const result = whitelistParser.parse(content);
            expect(result.whitelist).toEqual(['google.com']);
            expect(result.blockedSubdomains).toEqual(['ads.google.com']);
            expect(result.blockedPaths).toEqual(['*/ads/*']);
        });

        it('should normalize to lowercase', () => {
            const content = `
                ## WHITELIST
                GOOGLE.COM
            `;
            const result = whitelistParser.parse(content);
            expect(result.whitelist).toEqual(['google.com']);
        });

        it('should ignore comments', () => {
            const content = `
                ## WHITELIST
                # This is a comment
                google.com
            `;
            const result = whitelistParser.parse(content);
            expect(result.whitelist).toEqual(['google.com']);
        });

        it('should handle empty content', () => {
            const result = whitelistParser.parse('');
            expect(result.enabled).toBe(true);
            expect(result.whitelist).toEqual([]);
        });
    });

    describe('serialize()', () => {
        it('should serialize simple data', () => {
            const data: GroupData = {
                enabled: true,
                whitelist: ['google.com', 'github.com'],
                blockedSubdomains: [],
                blockedPaths: []
            };
            const result = whitelistParser.serialize(data);
            expect(result).toContain('## WHITELIST');
            expect(result).toContain('google.com');
            expect(result).toContain('github.com');
        });

        it('should add #DESACTIVADO when disabled', () => {
            const data: GroupData = {
                enabled: false,
                whitelist: ['google.com'],
                blockedSubdomains: [],
                blockedPaths: []
            };
            const result = whitelistParser.serialize(data);
            expect(result.startsWith('#DESACTIVADO')).toBe(true);
        });

        it('should sort entries alphabetically', () => {
            const data: GroupData = {
                enabled: true,
                whitelist: ['zeta.com', 'alpha.com'],
                blockedSubdomains: [],
                blockedPaths: []
            };
            const result = whitelistParser.serialize(data);
            const lines = result.split('\n').filter(l => l && !l.startsWith('##'));
            expect(lines[0]).toBe('alpha.com');
            expect(lines[1]).toBe('zeta.com');
        });

        it('should serialize all sections', () => {
            const data: GroupData = {
                enabled: true,
                whitelist: ['google.com'],
                blockedSubdomains: ['ads.google.com'],
                blockedPaths: ['*/ads/*']
            };
            const result = whitelistParser.serialize(data);
            expect(result).toContain('## WHITELIST');
            expect(result).toContain('## BLOCKED-SUBDOMAINS');
            expect(result).toContain('## BLOCKED-PATHS');
        });
    });

    describe('Integrity', () => {
        it('parse -> serialize should be stable', () => {
            const content = '## WHITELIST\ngithub.com\ngoogle.com\n\n## BLOCKED-SUBDOMAINS\nads.google.com\n\n## BLOCKED-PATHS\n*/ads/*\n';
            const parsed = whitelistParser.parse(content);
            const serialized = whitelistParser.serialize(parsed);
            expect(serialized).toBe(content);
        });

        it('should handle mixed case and whitespace', () => {
            const content = '  ## WHITELIST  \n  Google.com  \n';
            const expected = '## WHITELIST\ngoogle.com\n';
            const parsed = whitelistParser.parse(content);
            const serialized = whitelistParser.serialize(parsed);
            expect(serialized).toBe(expected);
        });
    });
});
