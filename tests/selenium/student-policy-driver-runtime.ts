import { buildPopupUrl } from './student-policy-env';
import type { DomainStatusPayload, RuntimeResponse } from './student-policy-types';
import type { StudentPolicyDriverState } from './student-policy-driver-state';

export type CrossOriginElementProbeType = 'script' | 'image' | 'stylesheet' | 'font';

async function openPopupContext(state: StudentPolicyDriverState): Promise<void> {
  const driver = state.getDriver();
  try {
    await driver.get(buildPopupUrl(state.getExtensionUuid()));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Navigation timed out')) {
      throw error;
    }
  }

  await driver.wait(async () => {
    try {
      return await driver.executeScript<boolean>(
        `return typeof globalThis.browser?.runtime?.sendMessage === 'function';`
      );
    } catch {
      return false;
    }
  }, 5_000);
}

export async function refreshBlockedPathRules(state: StudentPolicyDriverState): Promise<void> {
  const driver = state.getDriver();
  await openPopupContext(state);
  const result: { ok: boolean; value?: { success?: boolean; error?: string }; error?: string } =
    await driver.executeAsyncScript(
      `const done = arguments[arguments.length - 1];
       Promise.resolve(browser.runtime.sendMessage({ action: 'refreshBlockedPathRules', tabId: 0 }))
         .then((value) => done({ ok: true, value }))
         .catch((error) => done({ ok: false, error: String(error) }));`
    );

  if (!result.ok) {
    throw new Error(`Failed to refresh blocked-path rules: ${result.error ?? 'unknown error'}`);
  }

  if (result.value?.success !== true) {
    throw new Error(
      `Blocked-path refresh was rejected: ${result.value?.error ?? 'unknown runtime error'}`
    );
  }
}

export async function refreshBlockedSubdomainRules(state: StudentPolicyDriverState): Promise<void> {
  const driver = state.getDriver();
  await openPopupContext(state);
  const result: { ok: boolean; value?: { success?: boolean; error?: string }; error?: string } =
    await driver.executeAsyncScript(
      `const done = arguments[arguments.length - 1];
       Promise.resolve(browser.runtime.sendMessage({ action: 'refreshBlockedSubdomainRules', tabId: 0 }))
         .then((value) => done({ ok: true, value }))
         .catch((error) => done({ ok: false, error: String(error) }));`
    );

  if (!result.ok) {
    throw new Error(
      `Failed to refresh blocked-subdomain rules: ${result.error ?? 'unknown error'}`
    );
  }

  if (result.value?.success !== true) {
    throw new Error(
      `Blocked-subdomain refresh was rejected: ${result.value?.error ?? 'unknown runtime error'}`
    );
  }
}

export async function sendRuntimeMessage<T>(
  state: StudentPolicyDriverState,
  message: Record<string, unknown>
): Promise<T> {
  const driver = state.getDriver();
  await openPopupContext(state);
  const result: { ok: boolean; value?: T; error?: string } = await driver.executeAsyncScript(
    `const [payload, done] = [arguments[0], arguments[arguments.length - 1]];
     Promise.resolve(browser.runtime.sendMessage(payload))
       .then((value) => done({ ok: true, value }))
       .catch((error) => done({ ok: false, error: String(error) }));`,
    message
  );

  if (!result.ok) {
    throw new Error(result.error ?? 'Unknown browser.runtime.sendMessage failure');
  }

  return result.value as T;
}

export async function getActiveTabId(state: StudentPolicyDriverState): Promise<number> {
  const driver = state.getDriver();
  await openPopupContext(state);
  const result: number | null = await driver.executeAsyncScript(
    `const done = arguments[arguments.length - 1];
     browser.tabs.query({ active: true, currentWindow: true })
       .then((tabs) => done(tabs[0]?.id ?? null))
       .catch(() => done(null));`
  );

  if (result === null) {
    throw new Error('Could not resolve active browser tab ID');
  }

  return result;
}

export async function getDomainStatuses(
  state: StudentPolicyDriverState
): Promise<Record<string, DomainStatusPayload>> {
  const payload = await sendRuntimeMessage<RuntimeResponse<never>>(state, {
    action: 'getDomainStatuses',
    tabId: await getActiveTabId(state),
  });
  return payload.statuses ?? {};
}

export async function getBlockedPathRulesDebug(state: StudentPolicyDriverState): Promise<{
  version: string;
  count: number;
  rawRules: string[];
  compiledPatterns: string[];
}> {
  const payload = await sendRuntimeMessage<RuntimeResponse<never>>(state, {
    action: 'getBlockedPathRulesDebug',
    tabId: 0,
  });

  return {
    version: payload.version ?? '',
    count: payload.count ?? 0,
    rawRules: payload.rawRules ?? [],
    compiledPatterns: payload.compiledPatterns ?? [],
  };
}

export async function getNativeBlockedPathsDebug(state: StudentPolicyDriverState): Promise<{
  success: boolean;
  count: number;
  paths: string[];
  source?: string;
  error?: string;
}> {
  const payload = await sendRuntimeMessage<RuntimeResponse<never>>(state, {
    action: 'getNativeBlockedPathsDebug',
    tabId: 0,
  });

  return {
    success: payload.success === true,
    count: payload.count ?? 0,
    paths: (payload as RuntimeResponse<never> & { paths?: string[] }).paths ?? [],
    source: (payload as RuntimeResponse<never> & { source?: string }).source,
    error: payload.error,
  };
}

export async function evaluateBlockedPathDebug(
  state: StudentPolicyDriverState,
  url: string,
  type: string
): Promise<unknown> {
  const payload = await sendRuntimeMessage<RuntimeResponse<never> & { outcome?: unknown }>(state, {
    action: 'evaluateBlockedPathDebug',
    tabId: 0,
    url,
    type,
  });

  return payload.outcome ?? null;
}

export async function runCrossOriginFetchProbe(
  state: StudentPolicyDriverState,
  targetUrl: string
): Promise<'ok' | 'blocked'> {
  const driver = state.getDriver();
  const result: 'ok' | 'blocked' = await driver.executeAsyncScript(
    `const [url, done] = [arguments[0], arguments[arguments.length - 1]];
     const controller = new AbortController();
     const timeoutId = setTimeout(() => controller.abort(), 12000);
     fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store', signal: controller.signal })
       .then((response) => done(response.ok ? 'ok' : 'blocked'))
       .catch(() => done('blocked'))
       .finally(() => clearTimeout(timeoutId));`,
    targetUrl
  );
  return result;
}

export async function runCrossOriginXhrProbe(
  state: StudentPolicyDriverState,
  targetUrl: string
): Promise<'ok' | 'blocked'> {
  const driver = state.getDriver();
  const result: 'ok' | 'blocked' = await driver.executeAsyncScript(
    `const [url, done] = [arguments[0], arguments[arguments.length - 1]];
     const xhr = new XMLHttpRequest();
     let completed = false;
     const finish = (value) => {
       if (completed) {
         return;
       }
       completed = true;
       clearTimeout(timeoutId);
       done(value);
     };
     const timeoutId = setTimeout(() => {
       try {
         xhr.abort();
       } catch {}
       finish('blocked');
     }, 12000);
     xhr.open('GET', url);
     xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? 'ok' : 'blocked');
     xhr.onerror = () => finish('blocked');
     xhr.send();`,
    targetUrl
  );
  return result;
}

export async function runCrossOriginElementProbe(
  state: StudentPolicyDriverState,
  targetUrl: string,
  probeType: CrossOriginElementProbeType
): Promise<'ok' | 'blocked'> {
  const driver = state.getDriver();
  const result: 'ok' | 'blocked' = await driver.executeAsyncScript(
    `const [url, probeType, done] = [arguments[0], arguments[1], arguments[arguments.length - 1]];
     let completed = false;
     const finish = (value) => {
       if (completed) {
         return;
       }
       completed = true;
       clearTimeout(timeoutId);
       done(value);
     };
     const withCacheBust = url + (url.includes('?') ? '&' : '?') + 'cache=' + Date.now();
     const timeoutId = setTimeout(() => finish('blocked'), 12000);

     if (probeType === 'script') {
       const script = document.createElement('script');
       script.async = true;
       script.onload = () => finish('ok');
       script.onerror = () => finish('blocked');
       script.src = withCacheBust;
       document.body.appendChild(script);
       return;
     }

     if (probeType === 'image') {
       const image = new Image();
       image.onload = () => finish('ok');
       image.onerror = () => finish('blocked');
       image.src = withCacheBust;
       return;
     }

     if (probeType === 'stylesheet') {
       const link = document.createElement('link');
       link.rel = 'stylesheet';
       link.onload = () => finish('ok');
       link.onerror = () => finish('blocked');
       link.href = withCacheBust;
       document.head.appendChild(link);
       return;
     }

     if (probeType === 'font') {
       const link = document.createElement('link');
       link.rel = 'preload';
       link.as = 'font';
       link.type = 'font/woff2';
       link.crossOrigin = 'anonymous';
       link.onload = () => finish('ok');
       link.onerror = () => finish('blocked');
       link.href = withCacheBust;
       document.head.appendChild(link);
       return;
     }

     finish('blocked');`,
    targetUrl,
    probeType
  );
  return result;
}

export async function rerunPortalSubdomainProbe(state: StudentPolicyDriverState): Promise<void> {
  const driver = state.getDriver();
  await driver.executeScript('return window.runSubdomainProbe && window.runSubdomainProbe();');
}

export async function rerunIframeProbe(state: StudentPolicyDriverState): Promise<void> {
  const driver = state.getDriver();
  await driver.executeScript('return window.runIframeProbe && window.runIframeProbe();');
}

export async function rerunXhrProbe(state: StudentPolicyDriverState): Promise<void> {
  const driver = state.getDriver();
  await driver.executeScript('return window.runXhrProbe && window.runXhrProbe();');
}

export async function rerunFetchProbe(state: StudentPolicyDriverState): Promise<void> {
  const driver = state.getDriver();
  await driver.executeScript('return window.runFetchProbe && window.runFetchProbe();');
}
