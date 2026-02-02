import { Browser } from 'webextension-polyfill';

declare global {
  const browser: Browser;

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
  }
}
