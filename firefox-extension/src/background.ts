import type { Browser } from 'webextension-polyfill';
import { createBackgroundRuntime } from './lib/background-runtime.js';

declare const browser: Browser;
const NATIVE_HOST_NAME = 'whitelist_native_host';
const backgroundRuntime = createBackgroundRuntime(browser, { hostName: NATIVE_HOST_NAME });

void backgroundRuntime.init();
