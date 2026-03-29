import { logger, getErrorMessage } from './logger.js';

const NATIVE_HOST_NAME = 'whitelist_native_host';

interface NativeHostConfigResponse {
  success: boolean;
  action?: string;
  apiUrl?: string;
  requestApiUrl?: string;
  fallbackApiUrls?: string[];
  error?: string;
}

export interface RequestConfig {
  requestApiUrl: string;
  fallbackApiUrls: string[];
  requestTimeout: number;
  enableRequests: boolean;
  // Deprecated legacy fallback; requests now authenticate with the machine token from the host.
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
  return config.enableRequests && getRequestApiEndpoints(config).length > 0;
}

function normalizeApiUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

async function loadNativeRequestConfig(): Promise<Partial<RequestConfig>> {
  try {
    const response: NativeHostConfigResponse = await browser.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      {
        action: 'get-config',
      }
    );

    if (!response.success) {
      logger.warn('[Config] Native host config unavailable', {
        error: response.error ?? 'Unknown native host error',
      });
      return {};
    }

    const primaryApiUrl = response.requestApiUrl ?? response.apiUrl ?? '';
    const fallbackApiUrls = Array.isArray(response.fallbackApiUrls)
      ? response.fallbackApiUrls.map((url) => url.trim()).filter((url) => url.length > 0)
      : [];

    if (primaryApiUrl.trim() === '' && fallbackApiUrls.length === 0) {
      return {};
    }

    return {
      requestApiUrl: normalizeApiUrl(primaryApiUrl),
      fallbackApiUrls: fallbackApiUrls.map(normalizeApiUrl),
      enableRequests: true,
    };
  } catch (error) {
    logger.warn('[Config] Failed to load native config fallback', {
      error: getErrorMessage(error),
    });
    return {};
  }
}

export async function loadRequestConfig(): Promise<RequestConfig> {
  const nativeFallback = await loadNativeRequestConfig();

  try {
    const stored = await browser.storage.sync.get('config');
    const incoming = stored.config as Partial<RequestConfig> | undefined;
    return {
      ...DEFAULT_REQUEST_CONFIG,
      ...nativeFallback,
      ...(incoming ?? {}),
    };
  } catch (error) {
    logger.warn('[Config] Failed to load stored config', {
      error: getErrorMessage(error),
    });
    return {
      ...DEFAULT_REQUEST_CONFIG,
      ...nativeFallback,
    };
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
