import { Browser } from 'webextension-polyfill';

declare global {
  const browser: Browser;

  type DomainStatusState =
    | 'detected'
    | 'pending'
    | 'autoApproved'
    | 'duplicate'
    | 'localUpdateError'
    | 'apiError';

  interface DomainStatus {
    state: DomainStatusState;
    updatedAt: number;
    message?: string;
    requestType?: string;
  }

  interface Config {
    requestApiUrl: string;
    fallbackApiUrls: string[];
    requestTimeout: number;
    defaultGroup: string;
    enableRequests: boolean;
    debugMode: boolean;
    sharedSecret: string;
    [key: string]: unknown;
  }

  // Extend Window interface for type-safe global config access
  // Config is set by config.ts which is loaded before popup.ts via manifest
  interface Window {
    OPENPATH_CONFIG?: Config;
    loadOpenPathConfig?: () => Promise<Config>;
    saveOpenPathConfig?: (c: Partial<Config>) => Promise<void>;
    getApiUrl?: () => string;
    getAllApiUrls?: () => string[];
    hasValidRequestConfig?: () => boolean;
  }
}
