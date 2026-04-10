import {
  buildBlockedScreenContextFromSearch,
  buildSubmitBlockedDomainRequestMessage,
} from './lib/blocked-screen-contract.js';

interface BlockedPageRuntime {
  sendMessage(message: unknown): Promise<unknown>;
}

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

function setRequestStatus(text: string, type?: 'success' | 'error' | 'pending'): void {
  const el = getElement('request-status');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('success', 'error', 'pending');
  if (type) {
    el.classList.add(type);
  }
}

function getBrowserRuntime(): BlockedPageRuntime | null {
  const globalWithBrowser = globalThis as {
    browser?: { runtime?: Partial<BlockedPageRuntime> };
  };
  const runtime = globalWithBrowser.browser?.runtime;
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

  submitBtn.addEventListener('click', () => {
    void (async (): Promise<void> => {
      const reason = reasonInput.value.trim();
      if (reason.length < 3) {
        setRequestStatus('Escribe una breve razon para la solicitud.', 'error');
        return;
      }

      submitBtn.disabled = true;
      setRequestStatus('Enviando solicitud...', 'pending');

      try {
        const response = (await submitUnblockRequest({
          domain: context.blockedDomain,
          reason,
          origin: context.origin,
          error: context.error,
        })) as { success?: boolean; error?: unknown } | null;
        if (response?.success === true) {
          setRequestStatus('Solicitud enviada. Quedara pendiente hasta que la revisen.', 'success');
          reasonInput.value = '';
          return;
        }

        setRequestStatus(buildFallbackMessage(response?.error), 'error');
      } catch (requestError) {
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
