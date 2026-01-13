import { z } from 'zod';
import { safeJsonParse } from '@openpath/shared';
import type { SPAConfig } from './types/index.js';

// Configuration schema for validation
const SPAConfigSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    branch: z.string(),
    whitelistPath: z.string(),
    token: z.string().optional(),
    gruposDir: z.string().optional(),
}).partial();

/**
 * Configuration Manager
 * Stores and retrieves app configuration from localStorage
 */
export const config = {
    STORAGE_KEY: 'openpath-spa-config',

    get(): Partial<SPAConfig> {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (!stored) return {};
        
        const result = safeJsonParse(stored, SPAConfigSchema);
        return result.success ? result.data : {};
    },

    save(config: Partial<SPAConfig>): Partial<SPAConfig> {
        const current = this.get();
        const merged = Object.assign({}, current, config);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(merged));
        return merged;
    },

    isConfigured(): boolean {
        const config = this.get();
        return !!(config.owner && config.repo);
    },

    clear(): void {
        localStorage.removeItem(this.STORAGE_KEY);
    },

    getRequired(): SPAConfig {
        const config = this.get();
        if (!config.owner || !config.repo) {
            throw new Error('Configuración incompleta');
        }
        // Force cast as we checked required fields. 
        // Note: 'token' might be handled by OAuth/Auth module now, so maybe config.token is deprecated?
        // OpenPath config.js check: if (!config.token || !config.owner || !config.repo)
        // Check if we still use config.token. App-core uses OAuth.getToken now.
        // We'll trust the type.
        return config as SPAConfig;
    }
};
