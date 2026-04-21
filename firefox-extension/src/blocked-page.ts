import {
  buildBlockedScreenContextFromSearch,
  buildSubmitBlockedDomainRequestMessage,
} from './lib/blocked-screen-contract.js';

interface BlockedPageRuntime {
  sendMessage(message: unknown): Promise<unknown>;
}

interface CallbackRuntime {
  lastError?: { message?: string } | null;
  sendMessage(message: unknown, callback: (response: unknown) => void): void;
}

type RequestStatusType = 'success' | 'error' | 'pending';

const RECENT_REQUEST_STATUS_TTL_MS = 120_000;

function getElement(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setText(id: string, value: string): void {
  const el = getElement(id);
  if (!el) return;
  el.textContent = value;
}

function setFeedback(text: string): void {
  setText('copy-feedback', text);
}

function setRequestStatus(text: string, type?: RequestStatusType): void {
  const el = getElement('request-status');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('success', 'error', 'pending');
  if (type) {
    el.classList.add(type);
  }
}

function buildRecentRequestStatusKey(domain: string): string {
  return `openpath:blocked-request-status:${encodeURIComponent(domain)}`;
}

function getSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function clearRecentRequestStatus(domain: string): void {
  try {
    getSessionStorage()?.removeItem(buildRecentRequestStatusKey(domain));
  } catch {
    // Best effort only; the visible page state is still updated directly.
  }
}

function saveRecentRequestStatus(domain: string, text: string, type: RequestStatusType): void {
  try {
    getSessionStorage()?.setItem(
      buildRecentRequestStatusKey(domain),
      JSON.stringify({
        storedAt: Date.now(),
        text,
        type,
      })
    );
  } catch {
    // Best effort only; the visible page state is still updated directly.
  }
}

function restoreRecentRequestStatus(domain: string): void {
  const storage = getSessionStorage();
  if (!storage) return;

  const key = buildRecentRequestStatusKey(domain);
  try {
    const rawStatus = storage.getItem(key);
    if (!rawStatus) return;

    const status = JSON.parse(rawStatus) as {
      storedAt?: unknown;
      text?: unknown;
      type?: unknown;
    };
    if (
      typeof status.storedAt !== 'number' ||
      Date.now() - status.storedAt > RECENT_REQUEST_STATUS_TTL_MS ||
      typeof status.text !== 'string' ||
      !['success', 'error', 'pending'].includes(String(status.type))
    ) {
      storage.removeItem(key);
      return;
    }

    setRequestStatus(status.text, status.type as RequestStatusType);
  } catch {
    storage.removeItem(key);
  }
}

function getBrowserRuntime(): BlockedPageRuntime | null {
  const globalWithRuntime = globalThis as {
    browser?: { runtime?: Partial<BlockedPageRuntime> };
    chrome?: { runtime?: Partial<CallbackRuntime> };
  };

  const callbackRuntime = globalWithRuntime.chrome?.runtime;
  if (typeof callbackRuntime?.sendMessage === 'function') {
    const sendMessage = callbackRuntime.sendMessage.bind(callbackRuntime);
    return {
      sendMessage: (message: unknown) =>
        new Promise((resolve, reject) => {
          try {
            sendMessage(message, (response: unknown) => {
              const lastError = callbackRuntime.lastError;
              if (lastError) {
                reject(new Error(lastError.message ?? 'runtime.sendMessage failed'));
                return;
              }

              resolve(response);
            });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }),
    };
  }

  const runtime = globalWithRuntime.browser?.runtime;
  return typeof runtime?.sendMessage === 'function'
    ? { sendMessage: runtime.sendMessage.bind(runtime) }
    : null;
}

async function copyText(text: string): Promise<boolean> {
  if (!text) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function buildFallbackMessage(error: unknown): string {
  const detail =
    typeof error === 'string' ? ` ${error}` : error instanceof Error ? ` ${error.message}` : '';
  return `No se pudo enviar la solicitud.${detail} Copia el dominio y avisa a tu profesor.`;
}

async function submitUnblockRequest(input: {
  domain: string;
  reason: string;
  origin: string | null;
  error: string;
}): Promise<unknown> {
  const runtime = getBrowserRuntime();
  if (!runtime) {
    return {
      success: false,
      error: 'La extension no esta disponible en esta pagina.',
    };
  }

  return runtime.sendMessage(buildSubmitBlockedDomainRequestMessage(input));
}

export function main(): void {
  const context = buildBlockedScreenContextFromSearch(window.location.search);

  setText('blocked-domain', context.blockedDomain);
  setText('blocked-error', context.error);
  setText('blocked-origin', context.displayOrigin);

  getElement('go-back')?.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.replace('about:blank');
  });

  getElement('copy-domain')?.addEventListener('click', () => {
    void (async (): Promise<void> => {
      const ok = await copyText(context.blockedDomain);
      setFeedback(ok ? 'Dominio copiado al portapapeles.' : 'No se pudo copiar el dominio.');
    })();
  });

  const reasonInput = getElement('request-reason') as HTMLInputElement | null;
  const submitBtn = getElement('submit-unblock-request') as HTMLButtonElement | null;
  if (!reasonInput || !submitBtn) {
    return;
  }

  restoreRecentRequestStatus(context.blockedDomain);

  submitBtn.addEventListener('click', () => {
    void (async (): Promise<void> => {
      const reason = reasonInput.value.trim();
      if (reason.length < 3) {
        setRequestStatus('Escribe una breve razon para la solicitud.', 'error');
        return;
      }

      submitBtn.disabled = true;
      clearRecentRequestStatus(context.blockedDomain);
      setRequestStatus('Enviando solicitud...', 'pending');

      try {
        const response = (await submitUnblockRequest({
          domain: context.blockedDomain,
          reason,
          origin: context.origin,
          error: context.error,
        })) as { success?: boolean; error?: unknown } | null;
        if (response?.success === true) {
          const successText = 'Solicitud enviada. Quedara pendiente hasta que la revisen.';
          setRequestStatus(successText, 'success');
          saveRecentRequestStatus(context.blockedDomain, successText, 'success');
          reasonInput.value = '';
          return;
        }

        clearRecentRequestStatus(context.blockedDomain);
        setRequestStatus(buildFallbackMessage(response?.error), 'error');
      } catch (requestError) {
        clearRecentRequestStatus(context.blockedDomain);
        setRequestStatus(buildFallbackMessage(requestError), 'error');
      } finally {
        submitBtn.disabled = false;
      }
    })();
  });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  main();
}
