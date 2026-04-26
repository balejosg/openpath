export interface PageActivityRuntime {
  sendMessage: (message: unknown) => unknown;
}

interface RuntimeGlobal {
  browser?: { runtime?: Partial<PageActivityRuntime> };
  chrome?: { runtime?: Partial<PageActivityRuntime> };
  location?: { href?: string };
}

export function buildPageActivityMessage(url: string): { action: string; url: string } {
  return {
    action: 'openpathPageActivity',
    url,
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

function getRuntime(): PageActivityRuntime | null {
  const runtimeGlobal = globalThis as RuntimeGlobal;
  const runtime = runtimeGlobal.browser?.runtime ?? runtimeGlobal.chrome?.runtime;
  return typeof runtime?.sendMessage === 'function' ? (runtime as PageActivityRuntime) : null;
}

function getCurrentUrl(): string {
  const runtimeGlobal = globalThis as RuntimeGlobal;
  return typeof runtimeGlobal.location?.href === 'string' ? runtimeGlobal.location.href : '';
}

notifyPageActivity();
