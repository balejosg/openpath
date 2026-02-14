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

  const backBtn = document.getElementById('go-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.replace('about:blank');
    });
  }

  const copyBtn = document.getElementById('copy-domain');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const ok = await copyText(blockedDomain);
      setFeedback(ok ? 'Dominio copiado al portapapeles.' : 'No se pudo copiar el dominio.');
    });
  }
}

main();
