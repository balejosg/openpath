type OpenPathPageResourceKind =
  | 'fetch'
  | 'xmlhttprequest'
  | 'image'
  | 'script'
  | 'stylesheet'
  | 'font'
  | 'other';

interface OpenPathRuntimeLike {
  sendMessage?: (message: unknown) => Promise<unknown>;
}

interface OpenPathContentGlobal {
  browser?: { runtime?: OpenPathRuntimeLike };
  chrome?: { runtime?: OpenPathRuntimeLike };
}

((): void => {
  const contentGlobal = globalThis as typeof globalThis & OpenPathContentGlobal;
  const runtime = contentGlobal.browser?.runtime ?? contentGlobal.chrome?.runtime;
  const source = 'openpath-page-resource-candidate';

  function getCurrentUrl(): string {
    return window.location.href;
  }

  function sendRuntimeMessage(message: unknown): void {
    if (typeof runtime?.sendMessage !== 'function') {
      return;
    }

    try {
      void Promise.resolve(runtime.sendMessage(message)).catch(() => {
        // Best effort only. Page scripts must never be affected by extension wake-up.
      });
    } catch {
      // Best effort only. Page scripts must never be affected by extension wake-up.
    }
  }

  function notifyPageActivity(url = getCurrentUrl()): void {
    if (!url) {
      return;
    }

    sendRuntimeMessage({
      action: 'openpathPageActivity',
      url,
    });
  }

  function notifyPageResourceCandidate(
    resourceUrl: string,
    kind: OpenPathPageResourceKind,
    pageUrl = getCurrentUrl()
  ): void {
    if (!pageUrl || !resourceUrl) {
      return;
    }

    sendRuntimeMessage({
      action: 'openpathPageResourceCandidate',
      kind,
      pageUrl,
      resourceUrl,
    });
  }

  function getCurrentOrigin(): string {
    try {
      return new URL(getCurrentUrl()).origin;
    } catch {
      return '';
    }
  }

  function isPageResourceMessageOriginAllowed(
    eventOrigin: unknown,
    currentOrigin: string
  ): boolean {
    if (typeof eventOrigin !== 'string') {
      return true;
    }

    if (!eventOrigin || eventOrigin === 'null') {
      return true;
    }

    return !currentOrigin || eventOrigin === currentOrigin;
  }

  function installPageWorldObserver(): boolean {
    const script = document.createElement('script');
    const appendTarget =
      (document.head as HTMLElement | null) ?? (document.documentElement as HTMLElement | null);
    if (!appendTarget) {
      return false;
    }

    script.textContent = `(() => {
  const INSTALLED_KEY = '__openpathPageResourceObserverInstalled';
  const STATE_KEY = '__openpathPageResourceObserverState';
  const createState = () => ({
    attempts: 0,
    installed: false,
    lastError: null,
    lastNotification: null,
    notifications: {},
    patched: {
      fetch: false,
      xhrOpen: false,
      image: false,
      script: false,
      stylesheet: false,
      font: false,
      linkHref: false,
      setAttribute: false
    }
  });
  const getState = () => {
    let state = window[STATE_KEY];
    if (!state || typeof state !== 'object') {
      state = createState();
      try {
        Object.defineProperty(window, STATE_KEY, { configurable: true, value: state });
      } catch {
        window[STATE_KEY] = state;
      }
    }
    return state;
  };
  const state = getState();
  state.attempts += 1;
  state.installed = true;
  if (!window[INSTALLED_KEY]) {
    try {
      Object.defineProperty(window, INSTALLED_KEY, { configurable: true, value: true });
    } catch {
      window[INSTALLED_KEY] = true;
    }
  }
  const markPatched = (target, key) => {
    if (!target || target[key]) return false;
    try {
      Object.defineProperty(target, key, { configurable: true, value: true });
    } catch {
      target[key] = true;
    }
    return true;
  };
  const recordPatch = (key) => {
    try {
      state.patched[key] = true;
    } catch {}
  };
  const recordError = (error) => {
    try {
      state.lastError = String(error && error.message || error);
    } catch {}
  };
  const SOURCE = 'openpath-page-resource-candidate';
  const notify = (url, kind) => {
    if (!url) return;
    try {
      const payload = { source: SOURCE, url: String(url), kind };
      state.notifications[kind] = (state.notifications[kind] || 0) + 1;
      state.lastNotification = { kind, url: payload.url };
      window.postMessage(payload, '*');
      if (typeof CustomEvent === 'function' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(SOURCE, { detail: payload }));
      }
    } catch (error) {
      recordError(error);
    }
  };
  const unwrapUrl = (input) => {
    if (!input) return '';
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
    return '';
  };
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function' && markPatched(window, '__openpathPageResourceObserverFetchPatched')) {
    window.fetch = function(input, init) {
      notify(unwrapUrl(input), 'fetch');
      return originalFetch.call(this, input, init);
    };
    recordPatch('fetch');
  }
  const originalOpen = typeof XMLHttpRequest !== 'undefined' ? XMLHttpRequest.prototype.open : null;
  if (typeof originalOpen === 'function' && markPatched(XMLHttpRequest.prototype, '__openpathPageResourceObserverXhrOpenPatched')) {
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      notify(unwrapUrl(url), 'xmlhttprequest');
      return originalOpen.call(this, method, url, ...rest);
    };
    recordPatch('xhrOpen');
  }
  const patchUrlProperty = (prototype, property, kind) => {
    const patchKey = '__openpathPageResourceObserverPatched_' + property + '_' + kind;
    if (!markPatched(prototype, patchKey)) return;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    if (!descriptor || typeof descriptor.set !== 'function') {
      try { delete prototype[patchKey]; } catch {}
      return;
    }
    Object.defineProperty(prototype, property, {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value) {
        notify(unwrapUrl(value), kind);
        return descriptor.set.call(this, value);
      }
    });
    recordPatch(kind);
  };
  const getLinkResourceKind = (link) => {
    const relTokens = String(link && link.rel || '').toLowerCase().split(/\\s+/);
    const asValue = String(link && link.as || '').toLowerCase();
    if (relTokens.includes('preload') && asValue === 'font') return 'font';
    if (relTokens.includes('stylesheet')) return 'stylesheet';
    return 'other';
  };
  if (typeof HTMLImageElement !== 'undefined') patchUrlProperty(HTMLImageElement.prototype, 'src', 'image');
  if (typeof HTMLScriptElement !== 'undefined') patchUrlProperty(HTMLScriptElement.prototype, 'src', 'script');
  if (typeof HTMLLinkElement !== 'undefined') {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, 'href');
    if (descriptor && typeof descriptor.set === 'function' && markPatched(HTMLLinkElement.prototype, '__openpathPageResourceObserverPatched_href_link')) {
      Object.defineProperty(HTMLLinkElement.prototype, 'href', {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(value) {
          notify(unwrapUrl(value), getLinkResourceKind(this));
          return descriptor.set.call(this, value);
        }
      });
      recordPatch('linkHref');
      recordPatch('stylesheet');
      recordPatch('font');
    }
  }
  const originalSetAttribute = typeof Element !== 'undefined' ? Element.prototype.setAttribute : null;
  if (typeof originalSetAttribute === 'function' && markPatched(Element.prototype, '__openpathPageResourceObserverSetAttributePatched')) {
    Element.prototype.setAttribute = function(name, value) {
      const tag = String(this.tagName || '').toLowerCase();
      const attr = String(name || '').toLowerCase();
      if (tag === 'img' && attr === 'src') notify(value, 'image');
      if (tag === 'script' && attr === 'src') notify(value, 'script');
      if (tag === 'link' && attr === 'href') notify(value, getLinkResourceKind(this));
      return originalSetAttribute.call(this, name, value);
    };
    recordPatch('setAttribute');
  }
})();`;
    appendTarget.appendChild(script);
    script.remove();
    return true;
  }

  function getDomResourceCandidate(
    node: unknown
  ): { kind: OpenPathPageResourceKind; url: string } | null {
    const element = node as Partial<HTMLImageElement & HTMLScriptElement & HTMLLinkElement>;
    const tagName = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : '';
    if (tagName === 'img' && typeof element.src === 'string' && element.src.length > 0) {
      return { kind: 'image', url: element.src };
    }
    if (tagName === 'script' && typeof element.src === 'string' && element.src.length > 0) {
      return { kind: 'script', url: element.src };
    }
    if (tagName === 'link' && typeof element.href === 'string' && element.href.length > 0) {
      const relTokens =
        typeof element.rel === 'string' ? element.rel.toLowerCase().split(/\s+/) : [];
      const asValue = typeof element.as === 'string' ? element.as.toLowerCase() : '';
      if (relTokens.includes('preload') && asValue === 'font') {
        return { kind: 'font', url: element.href };
      }
      if (relTokens.includes('stylesheet')) {
        return { kind: 'stylesheet', url: element.href };
      }
    }

    return null;
  }

  function reportDomResourceCandidate(node: unknown): void {
    const candidate = getDomResourceCandidate(node);
    if (!candidate) {
      return;
    }

    notifyPageResourceCandidate(candidate.url, candidate.kind);
  }

  function relayCandidateData(candidateData: unknown): void {
    const data = (candidateData ?? {}) as { kind?: unknown; source?: unknown; url?: unknown };
    if (data.source !== source || typeof data.url !== 'string') {
      return;
    }

    const kind =
      data.kind === 'fetch' ||
      data.kind === 'xmlhttprequest' ||
      data.kind === 'image' ||
      data.kind === 'script' ||
      data.kind === 'stylesheet' ||
      data.kind === 'font'
        ? data.kind
        : 'other';

    notifyPageResourceCandidate(data.url, kind);
  }

  window.addEventListener('message', (event) => {
    const currentOrigin = getCurrentOrigin();
    if (!isPageResourceMessageOriginAllowed(event.origin, currentOrigin)) {
      return;
    }

    relayCandidateData(event.data);
  });

  window.addEventListener('openpath-page-resource-candidate', (event) => {
    relayCandidateData((event as CustomEvent).detail);
  });

  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          reportDomResourceCandidate(node);
        }
        if (
          record.attributeName === 'src' ||
          record.attributeName === 'href' ||
          record.attributeName === 'rel' ||
          record.attributeName === 'as'
        ) {
          reportDomResourceCandidate(record.target);
        }
      }
    });
    observer.observe(document, {
      attributeFilter: ['src', 'href', 'rel', 'as'],
      attributes: true,
      childList: true,
      subtree: true,
    });
  }

  notifyPageActivity();
  installPageWorldObserver();
  for (const delay of [0, 5, 25, 100, 500]) {
    window.setTimeout(installPageWorldObserver, delay);
  }
  window.addEventListener('DOMContentLoaded', installPageWorldObserver, { once: true });
})();
