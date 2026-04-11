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

function normalizeApiUrlList(urls: string[]): string[] {
  return urls.map(normalizeApiUrl).filter((url) => url.length > 0);
}

function readStoredConfig(source: unknown): {
  config?: Partial<RequestConfig>;
  hasConfig: boolean;
} {
  const maybeRecord =
    source !== null && typeof source === 'object' ? (source as Record<string, unknown>) : null;
  if (!maybeRecord || !('config' in maybeRecord)) {
    return { hasConfig: false };
  }

  const candidate = maybeRecord.config;
  if (candidate === null || typeof candidate !== 'object') {
    return { hasConfig: true };
  }

  return {
    config: candidate as Partial<RequestConfig>,
    hasConfig: true,
  };
}

function sanitizeStoredRequestConfig(
  incoming: Partial<RequestConfig> | undefined,
  nativeFallback: Partial<RequestConfig>
): Partial<RequestConfig> {
  if (!incoming) {
    return {};
  }

  const sanitized: Partial<RequestConfig> = { ...incoming };
  if (typeof incoming.requestApiUrl === 'string') {
    const normalizedRequestApiUrl = normalizeApiUrl(incoming.requestApiUrl);
    if (normalizedRequestApiUrl.length > 0) {
      sanitized.requestApiUrl = normalizedRequestApiUrl;
    } else if (nativeFallback.requestApiUrl) {
      delete sanitized.requestApiUrl;
    } else {
      sanitized.requestApiUrl = '';
    }
  }

  if (Array.isArray(incoming.fallbackApiUrls)) {
    const normalizedFallbackApiUrls = normalizeApiUrlList(incoming.fallbackApiUrls);
    if (normalizedFallbackApiUrls.length > 0) {
      sanitized.fallbackApiUrls = normalizedFallbackApiUrls;
    } else if ((nativeFallback.fallbackApiUrls?.length ?? 0) > 0) {
      delete sanitized.fallbackApiUrls;
    } else {
      sanitized.fallbackApiUrls = [];
    }
  }

  return sanitized;
}

async function loadStoredRequestConfig(
  nativeFallback: Partial<RequestConfig>
): Promise<Partial<RequestConfig>> {
  let syncStored: Partial<RequestConfig> | undefined;

  try {
    const localStored = readStoredConfig(await browser.storage.local.get('config'));
    if (localStored.hasConfig) {
      return sanitizeStoredRequestConfig(localStored.config, nativeFallback);
    }
  } catch (error) {
    logger.warn('[Config] Failed to load local stored config', {
      error: getErrorMessage(error),
    });
  }

  try {
    const syncStoredRecord = readStoredConfig(await browser.storage.sync.get('config'));
    syncStored = syncStoredRecord.config;
    return sanitizeStoredRequestConfig(syncStored, nativeFallback);
  } catch (error) {
    logger.warn('[Config] Failed to load sync stored config', {
      error: getErrorMessage(error),
    });
    return {};
  }
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
      fallbackApiUrls: normalizeApiUrlList(fallbackApiUrls),
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
  const storedConfig = await loadStoredRequestConfig(nativeFallback);
  return {
    ...DEFAULT_REQUEST_CONFIG,
    ...nativeFallback,
    ...storedConfig,
  };
}

export async function saveRequestConfig(newConfig: Partial<RequestConfig>): Promise<void> {
  try {
    const merged: RequestConfig = {
      ...DEFAULT_REQUEST_CONFIG,
      ...newConfig,
      requestApiUrl:
        typeof newConfig.requestApiUrl === 'string'
          ? normalizeApiUrl(newConfig.requestApiUrl)
          : DEFAULT_REQUEST_CONFIG.requestApiUrl,
      fallbackApiUrls: Array.isArray(newConfig.fallbackApiUrls)
        ? normalizeApiUrlList(newConfig.fallbackApiUrls)
        : DEFAULT_REQUEST_CONFIG.fallbackApiUrls,
    };
    await browser.storage.local.set({ config: merged });
  } catch (error) {
    logger.error('[Config] Failed to save config', {
      error: getErrorMessage(error),
    });
    throw error;
  }
}
