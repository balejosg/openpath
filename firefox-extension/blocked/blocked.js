function getSearchParam(params, key) {
  const value = params.get(key);
  return value && value.trim().length > 0 ? value : null;
}

function extractDomainFromUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).hostname || null;
  } catch {
    return null;
  }
}

async function copyText(text) {
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

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

function setFeedback(text) {
  setText('copy-feedback', text);
}

function getElement(id) {
  return document.getElementById(id);
}

function setRequestStatus(text, type) {
  const el = getElement('request-status');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('success', 'error', 'pending');
  if (type) {
    el.classList.add(type);
  }
}

function getBrowserRuntime() {
  return typeof browser !== 'undefined' && browser.runtime ? browser.runtime : null;
}

function buildFallbackMessage(error) {
  const detail = error ? ` ${error}` : '';
  return `No se pudo enviar la solicitud.${detail} Copia el dominio y avisa a tu profesor.`;
}

async function submitUnblockRequest(input) {
  const runtime = getBrowserRuntime();
  if (!runtime) {
    return {
      success: false,
      error: 'La extension no esta disponible en esta pagina.',
    };
  }

  return runtime.sendMessage({
    action: 'submitBlockedDomainRequest',
    domain: input.domain,
    reason: input.reason,
    origin: input.origin,
    error: input.error,
  });
}

function main() {
  const params = new URLSearchParams(window.location.search);
  const blockedUrl = getSearchParam(params, 'blockedUrl');
  const queryDomain = getSearchParam(params, 'domain');
  const blockedDomain = queryDomain || extractDomainFromUrl(blockedUrl) || 'dominio desconocido';
  const error = getSearchParam(params, 'error') || 'bloqueo de red/politica';
  const origin = getSearchParam(params, 'origin') || 'sin informacion';

  setText('blocked-domain', blockedDomain);
  setText('blocked-error', error);
  setText('blocked-origin', origin);

  const backBtn = getElement('go-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.replace('about:blank');
    });
  }

  const copyBtn = getElement('copy-domain');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const ok = await copyText(blockedDomain);
      setFeedback(ok ? 'Dominio copiado al portapapeles.' : 'No se pudo copiar el dominio.');
    });
  }

  const reasonInput = getElement('request-reason');
  const submitBtn = getElement('submit-unblock-request');
  if (reasonInput && submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const reason = reasonInput.value.trim();
      if (reason.length < 3) {
        setRequestStatus('Escribe una breve razon para la solicitud.', 'error');
        return;
      }

      submitBtn.disabled = true;
      setRequestStatus('Enviando solicitud...', 'pending');

      try {
        const response = await submitUnblockRequest({
          domain: blockedDomain,
          reason,
          origin,
          error,
        });
        if (response && response.success === true) {
          setRequestStatus('Solicitud enviada. Quedara pendiente hasta que la revisen.', 'success');
          reasonInput.value = '';
          return;
        }

        setRequestStatus(buildFallbackMessage(response && response.error), 'error');
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : String(requestError);
        setRequestStatus(buildFallbackMessage(message), 'error');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }
}

main();
