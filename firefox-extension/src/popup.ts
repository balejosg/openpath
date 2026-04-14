import type { Browser } from 'webextension-polyfill';
import { buildSubmitBlockedDomainRequestMessage } from './lib/blocked-screen-contract.js';
import { createPopupController } from './lib/popup-controller.js';

declare const browser: Browser;

const popupController = createPopupController(browser, {
  buildSubmitMessage: buildSubmitBlockedDomainRequestMessage,
});

popupController.mount();
