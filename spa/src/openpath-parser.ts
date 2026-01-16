import type { GroupData } from './types/index.js';

/**
 * OpenPath File Parser
 * Parses and serializes the whitelist.txt format with sections
 */
export const whitelistParser = {
    SECTIONS: {
        WHITELIST: '## WHITELIST',
        BLOCKED_SUBDOMAINS: '## BLOCKED-SUBDOMAINS',
        BLOCKED_PATHS: '## BLOCKED-PATHS'
    },

    /**
     * Parse whitelist file content into structured data
     */
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

        // Check if disabled - find first non-empty line
        const firstLine = lines.find(l => l.trim() !== '');
        if (firstLine?.trim().toUpperCase() === '#DESACTIVADO') {
            result.enabled = false;
        }

        for (const line of lines) {
            const trimmed = line.trim();

            // Skip empty lines and comments (except section headers)
            if (!trimmed || (trimmed.startsWith('#') && !trimmed.startsWith('##'))) {
                continue;
            }

            // Check for section headers
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

            // Add entry to current section
            if (currentSection && !trimmed.startsWith('#')) {
                const section = result[currentSection];
                if (Array.isArray(section)) {
                    section.push(trimmed.toLowerCase());
                }
            }
        }

        return result;
    },

    /**
     * Serialize structured data back to whitelist file format
     */
    serialize(data: GroupData): string {
        let content = '';

        // Add disabled marker if needed
        if (!data.enabled) {
            content += '#DESACTIVADO\n\n';
        }

        // Whitelist section
        if (data.whitelist.length > 0) {
            content += `${this.SECTIONS.WHITELIST}\n`;
            data.whitelist.sort().forEach((domain: string) => {
                content += `${domain}\n`;
            });
            content += '\n';
        }

        // Blocked subdomains section
        if (data.blockedSubdomains.length > 0) {
            content += `${this.SECTIONS.BLOCKED_SUBDOMAINS}\n`;
            data.blockedSubdomains.sort().forEach((subdomain: string) => {
                content += `${subdomain}\n`;
            });
            content += '\n';
        }

        // Blocked paths section
        if (data.blockedPaths.length > 0) {
            content += `${this.SECTIONS.BLOCKED_PATHS}\n`;
            data.blockedPaths.sort().forEach((path: string) => {
                content += `${path}\n`;
            });
            content += '\n';
        }

        return content.trim() + '\n';
    },

    /**
     * Get stats from parsed data
     */
    getStats(data: GroupData): { whitelist: number; blockedSubdomains: number; blockedPaths: number } {
        return {
            whitelist: data.whitelist.length,
            blockedSubdomains: data.blockedSubdomains.length,
            blockedPaths: data.blockedPaths.length
        };
    }
};
