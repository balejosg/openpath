import { logger, getErrorMessage } from './logger.js';

export interface RequestConfig {
  requestApiUrl: string;
  fallbackApiUrls: string[];
  requestTimeout: number;
  enableRequests: boolean;
  sharedSecret: string;
  debugMode: boolean;

  // Deprecated: the server now resolves group by calendar/default group.
  defaultGroup?: string;
}

export const DEFAULT_REQUEST_CONFIG: RequestConfig = {
  requestApiUrl: '',
  fallbackApiUrls: [],
  requestTimeout: 10000,
  enableRequests: true,
  sharedSecret: '',
  debugMode: false,
  defaultGroup: 'informatica-3',
};

export function getRequestApiEndpoints(config: RequestConfig): string[] {
  return [config.requestApiUrl, ...config.fallbackApiUrls].filter((url) => url.length > 0);
}

export function hasValidRequestConfig(config: RequestConfig): boolean {
  return (
    config.enableRequests &&
    config.sharedSecret.trim().length > 0 &&
    getRequestApiEndpoints(config).length > 0
  );
}

export async function loadRequestConfig(): Promise<RequestConfig> {
  try {
    const stored = await browser.storage.sync.get('config');
    const incoming = stored.config as Partial<RequestConfig> | undefined;
    return {
      ...DEFAULT_REQUEST_CONFIG,
      ...(incoming ?? {}),
    };
  } catch (error) {
    logger.warn('[Config] Failed to load stored config', {
      error: getErrorMessage(error),
    });
    return { ...DEFAULT_REQUEST_CONFIG };
  }
}

export async function saveRequestConfig(newConfig: Partial<RequestConfig>): Promise<void> {
  try {
    const merged: RequestConfig = { ...DEFAULT_REQUEST_CONFIG, ...newConfig };
    await browser.storage.sync.set({ config: merged });
  } catch (error) {
    logger.error('[Config] Failed to save config', {
      error: getErrorMessage(error),
    });
    throw error;
  }
}
