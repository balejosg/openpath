type OpenPathPageResourceKind =
  | 'fetch'
  | 'xmlhttprequest'
  | 'image'
  | 'script'
  | 'stylesheet'
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

  function installPageWorldObserver(): boolean {
    const script = document.createElement('script');
    const appendTarget =
      (document.head as HTMLElement | null) ?? (document.documentElement as HTMLElement | null);
    if (!appendTarget) {
      return false;
    }

    script.textContent = `(() => {
  const INSTALLED_KEY = '__openpathPageResourceObserverInstalled';
  if (window[INSTALLED_KEY]) return;
  try {
    Object.defineProperty(window, INSTALLED_KEY, { value: true });
  } catch {
    window[INSTALLED_KEY] = true;
  }
  const SOURCE = 'openpath-page-resource-candidate';
  const notify = (url, kind) => {
    if (!url) return;
    try {
      window.postMessage({ source: SOURCE, url: String(url), kind }, '*');
    } catch {}
  };
  const unwrapUrl = (input) => {
    if (!input) return '';
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
    return '';
  };
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function(input, init) {
      notify(unwrapUrl(input), 'fetch');
      return originalFetch.call(this, input, init);
    };
  }
  const originalOpen = typeof XMLHttpRequest !== 'undefined' ? XMLHttpRequest.prototype.open : null;
  if (typeof originalOpen === 'function') {
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      notify(unwrapUrl(url), 'xmlhttprequest');
      return originalOpen.call(this, method, url, ...rest);
    };
  }
  const patchUrlProperty = (prototype, property, kind) => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    if (!descriptor || typeof descriptor.set !== 'function') return;
    Object.defineProperty(prototype, property, {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value) {
        notify(unwrapUrl(value), kind);
        return descriptor.set.call(this, value);
      }
    });
  };
  if (typeof HTMLImageElement !== 'undefined') patchUrlProperty(HTMLImageElement.prototype, 'src', 'image');
  if (typeof HTMLScriptElement !== 'undefined') patchUrlProperty(HTMLScriptElement.prototype, 'src', 'script');
  if (typeof HTMLLinkElement !== 'undefined') patchUrlProperty(HTMLLinkElement.prototype, 'href', 'stylesheet');
  const originalSetAttribute = typeof Element !== 'undefined' ? Element.prototype.setAttribute : null;
  if (typeof originalSetAttribute === 'function') {
    Element.prototype.setAttribute = function(name, value) {
      const tag = String(this.tagName || '').toLowerCase();
      const attr = String(name || '').toLowerCase();
      if (tag === 'img' && attr === 'src') notify(value, 'image');
      if (tag === 'script' && attr === 'src') notify(value, 'script');
      if (tag === 'link' && attr === 'href') notify(value, 'stylesheet');
      return originalSetAttribute.call(this, name, value);
    };
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
    if (
      tagName === 'link' &&
      typeof element.rel === 'string' &&
      element.rel.toLowerCase() === 'stylesheet' &&
      typeof element.href === 'string' &&
      element.href.length > 0
    ) {
      return { kind: 'stylesheet', url: element.href };
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

  window.addEventListener('message', (event) => {
    const currentOrigin = getCurrentOrigin();
    if (typeof event.origin === 'string' && currentOrigin && event.origin !== currentOrigin) {
      return;
    }

    const data = (event.data ?? {}) as { kind?: unknown; source?: unknown; url?: unknown };
    if (data.source !== source || typeof data.url !== 'string') {
      return;
    }

    const kind =
      data.kind === 'fetch' ||
      data.kind === 'xmlhttprequest' ||
      data.kind === 'image' ||
      data.kind === 'script' ||
      data.kind === 'stylesheet'
        ? data.kind
        : 'other';

    notifyPageResourceCandidate(data.url, kind);
  });

  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          reportDomResourceCandidate(node);
        }
        if (record.attributeName === 'src' || record.attributeName === 'href') {
          reportDomResourceCandidate(record.target);
        }
      }
    });
    observer.observe(document, {
      attributeFilter: ['src', 'href'],
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
