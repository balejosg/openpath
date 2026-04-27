export interface PageActivityRuntime {
  sendMessage: (message: unknown) => unknown;
}

type PageResourceKind = 'fetch' | 'xmlhttprequest' | 'image' | 'script' | 'stylesheet' | 'other';

interface RuntimeGlobal {
  browser?: { runtime?: Partial<PageActivityRuntime> };
  chrome?: { runtime?: Partial<PageActivityRuntime> };
  addEventListener?: (
    type: string,
    listener: (event: { data?: unknown; origin?: string; source?: unknown }) => void,
    options?: unknown
  ) => void;
  document?: {
    createElement?: (tagName: string) => {
      remove?: () => void;
      textContent?: string | null;
    };
    documentElement?: { appendChild?: (node: unknown) => void } | undefined;
    head?: { appendChild?: (node: unknown) => void } | undefined;
  };
  location?: { href?: string };
  MutationObserver?: new (
    callback: (
      records: { addedNodes?: Iterable<unknown>; attributeName?: string | null; target?: unknown }[]
    ) => void
  ) => { observe?: (target: unknown, options: unknown) => void };
  setTimeout?: (callback: () => void, delay: number) => unknown;
  window?: unknown;
}

export function buildPageActivityMessage(url: string): { action: string; url: string } {
  return {
    action: 'openpathPageActivity',
    url,
  };
}

export function buildPageResourceCandidateMessage(
  pageUrl: string,
  resourceUrl: string,
  kind: PageResourceKind
): {
  action: string;
  kind: PageResourceKind;
  pageUrl: string;
  resourceUrl: string;
} {
  return {
    action: 'openpathPageResourceCandidate',
    kind,
    pageUrl,
    resourceUrl,
  };
}

export function notifyPageActivity(
  runtime: PageActivityRuntime | null | undefined = getRuntime(),
  url = getCurrentUrl()
): void {
  if (typeof runtime?.sendMessage !== 'function' || !url) {
    return;
  }

  try {
    void Promise.resolve(runtime.sendMessage(buildPageActivityMessage(url))).catch(() => {
      // Best effort only. The message exists to wake/register the background runtime.
    });
  } catch {
    // Best effort only. Page scripts must never be affected by extension wake-up.
  }
}

export function notifyPageResourceCandidate(
  runtime: PageActivityRuntime | null | undefined,
  resourceUrl: string,
  kind: PageResourceKind,
  pageUrl = getCurrentUrl()
): void {
  if (typeof runtime?.sendMessage !== 'function' || !pageUrl || !resourceUrl) {
    return;
  }

  try {
    void Promise.resolve(
      runtime.sendMessage(buildPageResourceCandidateMessage(pageUrl, resourceUrl, kind))
    ).catch(() => {
      // Best effort only. Page resource discovery must not affect the page.
    });
  } catch {
    // Best effort only. Page scripts must never be affected by extension wake-up.
  }
}

export function buildPageResourceObserverScript(): string {
  return `(() => {
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
}

function getDomResourceCandidate(node: unknown): {
  kind: Exclude<PageResourceKind, 'fetch' | 'xmlhttprequest' | 'other'>;
  url: string;
} | null {
  const element = node as { href?: unknown; rel?: unknown; src?: unknown; tagName?: unknown };
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

function reportDomResourceCandidate(
  runtime: PageActivityRuntime | null | undefined,
  runtimeGlobal: RuntimeGlobal,
  node: unknown
): void {
  const candidate = getDomResourceCandidate(node);
  if (!candidate) {
    return;
  }

  notifyPageResourceCandidate(runtime, candidate.url, candidate.kind, getCurrentUrl(runtimeGlobal));
}

function installDomResourceObserver(
  runtime: PageActivityRuntime | null | undefined,
  runtimeGlobal: RuntimeGlobal
): void {
  if (!runtimeGlobal.document || typeof runtimeGlobal.MutationObserver !== 'function') {
    return;
  }

  const observer = new runtimeGlobal.MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes ?? []) {
        reportDomResourceCandidate(runtime, runtimeGlobal, node);
      }

      if (record.attributeName === 'src' || record.attributeName === 'href') {
        reportDomResourceCandidate(runtime, runtimeGlobal, record.target);
      }
    }
  });

  observer.observe?.(runtimeGlobal.document, {
    attributeFilter: ['src', 'href'],
    attributes: true,
    childList: true,
    subtree: true,
  });
}

export function installPageResourceObserver(
  runtime: PageActivityRuntime | null | undefined = getRuntime(),
  runtimeGlobal: RuntimeGlobal = globalThis as unknown as RuntimeGlobal
): void {
  const source = 'openpath-page-resource-candidate';
  runtimeGlobal.addEventListener?.('message', (event) => {
    const currentOrigin = getCurrentOrigin(runtimeGlobal);
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

    notifyPageResourceCandidate(runtime, data.url, kind, getCurrentUrl(runtimeGlobal));
  });
  installDomResourceObserver(runtime, runtimeGlobal);

  const injectObserver = (): boolean => {
    const script = runtimeGlobal.document?.createElement?.('script');
    const appendTarget = runtimeGlobal.document?.head ?? runtimeGlobal.document?.documentElement;
    if (!script || !appendTarget?.appendChild) {
      return false;
    }

    script.textContent = buildPageResourceObserverScript();
    appendTarget.appendChild(script);
    script.remove?.();
    return true;
  };

  injectObserver();
  for (const delay of [0, 5, 25, 100, 500]) {
    runtimeGlobal.setTimeout?.(injectObserver, delay);
  }
  runtimeGlobal.addEventListener?.('DOMContentLoaded', injectObserver, { once: true });
}

function getRuntime(): PageActivityRuntime | null {
  const runtimeGlobal = globalThis as unknown as RuntimeGlobal;
  const runtime = runtimeGlobal.browser?.runtime ?? runtimeGlobal.chrome?.runtime;
  return typeof runtime?.sendMessage === 'function' ? (runtime as PageActivityRuntime) : null;
}

function getCurrentUrl(
  runtimeGlobal: RuntimeGlobal = globalThis as unknown as RuntimeGlobal
): string {
  return typeof runtimeGlobal.location?.href === 'string' ? runtimeGlobal.location.href : '';
}

function getCurrentOrigin(
  runtimeGlobal: RuntimeGlobal = globalThis as unknown as RuntimeGlobal
): string {
  const currentUrl = getCurrentUrl(runtimeGlobal);
  if (!currentUrl) {
    return '';
  }

  try {
    return new URL(currentUrl).origin;
  } catch {
    return '';
  }
}

notifyPageActivity();
installPageResourceObserver();
