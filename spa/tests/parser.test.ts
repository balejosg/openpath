/**
 * OpenPath - WhitelistParser Unit Tests
 * Tests for the whitelist file parser and serializer
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

// Import the parser (we recreate it here to test in isolation without DOM)
import type { GroupData } from '../src/types/index.js';

const whitelistParser = {
    SECTIONS: {
        WHITELIST: '## WHITELIST',
        BLOCKED_SUBDOMAINS: '## BLOCKED-SUBDOMAINS',
        BLOCKED_PATHS: '## BLOCKED-PATHS'
    },

    parse(content: string): GroupData {
        const result: GroupData = {
            enabled: true,
            whitelist: [],
            blockedSubdomains: [],
            blockedPaths: []
        };

        if (!content.trim()) {
            return result;
        }

        const lines = content.split('\n');
        let currentSection: keyof GroupData | null = null;

        const firstLine = lines.find(l => l.trim() !== '');
        if (firstLine?.trim().toUpperCase() === '#DESACTIVADO') {
            result.enabled = false;
        }

        for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed || (trimmed.startsWith('#') && !trimmed.startsWith('##'))) {
                continue;
            }

            if (trimmed === this.SECTIONS.WHITELIST) {
                currentSection = 'whitelist';
                continue;
            }
            if (trimmed === this.SECTIONS.BLOCKED_SUBDOMAINS) {
                currentSection = 'blockedSubdomains';
                continue;
            }
            if (trimmed === this.SECTIONS.BLOCKED_PATHS) {
                currentSection = 'blockedPaths';
                continue;
            }

            if (currentSection && !trimmed.startsWith('#')) {
                const section = result[currentSection];
                if (Array.isArray(section)) {
                    section.push(trimmed.toLowerCase());
                }
            }
        }

        return result;
    },

    serialize(data: GroupData): string {
        let content = '';

        if (!data.enabled) {
            content += '#DESACTIVADO\n\n';
        }

        if (data.whitelist.length > 0) {
            content += `${this.SECTIONS.WHITELIST}\n`;
            data.whitelist.sort().forEach((domain: string) => {
                content += `${domain}\n`;
            });
            content += '\n';
        }

        if (data.blockedSubdomains.length > 0) {
            content += `${this.SECTIONS.BLOCKED_SUBDOMAINS}\n`;
            data.blockedSubdomains.sort().forEach((subdomain: string) => {
                content += `${subdomain}\n`;
            });
            content += '\n';
        }

        if (data.blockedPaths.length > 0) {
            content += `${this.SECTIONS.BLOCKED_PATHS}\n`;
            data.blockedPaths.sort().forEach((path: string) => {
                content += `${path}\n`;
            });
            content += '\n';
        }

        return content.trim() + '\n';
    }
};

void describe('WhitelistParser', () => {
    void describe('parse()', () => {
        void test('should parse simple whitelist', () => {
            const content = `
                ## WHITELIST
                google.com
                github.com
            `;
            const result = whitelistParser.parse(content);
            assert.strictEqual(result.enabled, true);
            assert.deepStrictEqual(result.whitelist, ['google.com', 'github.com']);
            assert.deepStrictEqual(result.blockedSubdomains, []);
        });

        void test('should handle #DESACTIVADO marker', () => {
            const content = `
                #DESACTIVADO
                ## WHITELIST
                google.com
            `;
            const result = whitelistParser.parse(content);
            assert.strictEqual(result.enabled, false);
            assert.deepStrictEqual(result.whitelist, ['google.com']);
        });

        void test('should parse all sections', () => {
            const content = `
                ## WHITELIST
                google.com
                
                ## BLOCKED-SUBDOMAINS
                ads.google.com
                
                ## BLOCKED-PATHS
                */ads/*
            `;
            const result = whitelistParser.parse(content);
            assert.deepStrictEqual(result.whitelist, ['google.com']);
            assert.deepStrictEqual(result.blockedSubdomains, ['ads.google.com']);
            assert.deepStrictEqual(result.blockedPaths, ['*/ads/*']);
        });

        void test('should normalize to lowercase', () => {
            const content = `
                ## WHITELIST
                GOOGLE.COM
            `;
            const result = whitelistParser.parse(content);
            assert.deepStrictEqual(result.whitelist, ['google.com']);
        });

        void test('should ignore comments', () => {
            const content = `
                ## WHITELIST
                # This is a comment
                google.com
            `;
            const result = whitelistParser.parse(content);
            assert.deepStrictEqual(result.whitelist, ['google.com']);
        });

        void test('should handle empty content', () => {
            const result = whitelistParser.parse('');
            assert.strictEqual(result.enabled, true);
            assert.deepStrictEqual(result.whitelist, []);
        });
    });

    void describe('serialize()', () => {
        void test('should serialize simple data', () => {
            const data: GroupData = {
                enabled: true,
                whitelist: ['google.com', 'github.com'],
                blockedSubdomains: [],
                blockedPaths: []
            };
            const result = whitelistParser.serialize(data);
            assert.ok(result.includes('## WHITELIST'));
            assert.ok(result.includes('google.com'));
            assert.ok(result.includes('github.com'));
        });

        void test('should add #DESACTIVADO when disabled', () => {
            const data: GroupData = {
                enabled: false,
                whitelist: ['google.com'],
                blockedSubdomains: [],
                blockedPaths: []
            };
            const result = whitelistParser.serialize(data);
            assert.ok(result.startsWith('#DESACTIVADO'));
        });

        void test('should sort entries alphabetically', () => {
            const data: GroupData = {
                enabled: true,
                whitelist: ['zeta.com', 'alpha.com'],
                blockedSubdomains: [],
                blockedPaths: []
            };
            const result = whitelistParser.serialize(data);
            const lines = result.split('\n').filter(l => l && !l.startsWith('##'));
            assert.strictEqual(lines[0], 'alpha.com');
            assert.strictEqual(lines[1], 'zeta.com');
        });

        void test('should serialize all sections', () => {
            const data: GroupData = {
                enabled: true,
                whitelist: ['google.com'],
                blockedSubdomains: ['ads.google.com'],
                blockedPaths: ['*/ads/*']
            };
            const result = whitelistParser.serialize(data);
            assert.ok(result.includes('## WHITELIST'));
            assert.ok(result.includes('## BLOCKED-SUBDOMAINS'));
            assert.ok(result.includes('## BLOCKED-PATHS'));
        });
    });

    void describe('Integrity', () => {
        void test('parse -> serialize should be stable', () => {
            const content = '## WHITELIST\ngithub.com\ngoogle.com\n\n## BLOCKED-SUBDOMAINS\nads.google.com\n\n## BLOCKED-PATHS\n*/ads/*\n';
            const parsed = whitelistParser.parse(content);
            const serialized = whitelistParser.serialize(parsed);
            assert.strictEqual(serialized, content);
        });

        void test('should handle mixed case and whitespace', () => {
            const content = '  ## WHITELIST  \n  Google.com  \n';
            const expected = '## WHITELIST\ngoogle.com\n';
            const parsed = whitelistParser.parse(content);
            const serialized = whitelistParser.serialize(parsed);
            assert.strictEqual(serialized, expected);
        });
    });
});
