import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { test, describe } from 'node:test';
import vm from 'node:vm';

class MockElement {
  className = '';
  disabled = false;
  textContent = '';
  value = '';

  private readonly listeners = new Map<string, (() => unknown)[]>();

  readonly classList = {
    add: (...classes: string[]): void => {
      const current = new Set(this.className.split(/\s+/).filter(Boolean));
      classes.forEach((className) => current.add(className));
      this.className = Array.from(current).join(' ');
    },
    remove: (...classes: string[]): void => {
      const current = new Set(this.className.split(/\s+/).filter(Boolean));
      classes.forEach((className) => current.delete(className));
      this.className = Array.from(current).join(' ');
    },
  };

  addEventListener(type: string, listener: () => unknown): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async trigger(type: string): Promise<void> {
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      await Promise.resolve(listener());
    }
  }
}

function normalizeMessages(messages: unknown[]): Record<string, unknown>[] {
  return messages.map((message) => {
    const record = message as Record<string, unknown>;
    return {
      action: record.action,
      domain: record.domain,
      reason: record.reason,
      origin: record.origin,
      error: record.error,
    };
  });
}

function runBlockedScript(response: unknown): {
  elements: Map<string, MockElement>;
  messages: unknown[];
} {
  const ids = [
    'blocked-domain',
    'blocked-error',
    'blocked-origin',
    'copy-feedback',
    'go-back',
    'copy-domain',
    'request-reason',
    'submit-unblock-request',
    'request-status',
  ];
  const elements = new Map(ids.map((id) => [id, new MockElement()]));
  const messages: unknown[] = [];
  const script = readFileSync(new URL('../blocked/blocked.js', import.meta.url), 'utf8');

  const sandbox = {
    URL,
    URLSearchParams,
    browser: {
      runtime: {
        sendMessage: (message: unknown): Promise<unknown> => {
          messages.push(message);
          return Promise.resolve(response);
        },
      },
    },
    document: {
      getElementById: (id: string): MockElement | null => elements.get(id) ?? null,
    },
    navigator: {
      clipboard: {
        writeText: (): Promise<void> => Promise.resolve(),
      },
    },
    window: {
      history: { length: 1, back: (): void => undefined },
      location: {
        replace: (): void => undefined,
        search: '?domain=learning.example&error=NS_ERROR_UNKNOWN_HOST&origin=portal.example',
      },
    },
  };

  vm.runInNewContext(script, sandbox, { filename: 'blocked.js' });

  return { elements, messages };
}

void describe('blocked screen', () => {
  void test('renders student-oriented unblock request affordance', () => {
    const html = readFileSync(new URL('../blocked/blocked.html', import.meta.url), 'utf8');

    assert.match(html, /Este sitio esta bloqueado por ahora/);
    assert.match(html, /Solicitar desbloqueo/);
    assert.match(html, /Ver detalles tecnicos/);
  });

  void test('submits unblock request through the background script without exposing a token', async () => {
    const { elements, messages } = runBlockedScript({
      success: true,
      id: 'req_123',
      status: 'pending',
    });

    const reason = elements.get('request-reason');
    assert.ok(reason);
    reason.value = 'Lo necesito para una actividad de clase';

    await elements.get('submit-unblock-request')?.trigger('click');

    assert.deepStrictEqual(normalizeMessages(messages), [
      {
        action: 'submitBlockedDomainRequest',
        domain: 'learning.example',
        reason: 'Lo necesito para una actividad de clase',
        origin: 'portal.example',
        error: 'NS_ERROR_UNKNOWN_HOST',
      },
    ]);
    assert.match(elements.get('request-status')?.textContent ?? '', /Solicitud enviada/);
  });

  void test('shows a teacher fallback when request submission is unavailable', async () => {
    const { elements } = runBlockedScript({
      success: false,
      error: 'Configuracion incompleta para solicitar dominios',
    });

    const reason = elements.get('request-reason');
    assert.ok(reason);
    reason.value = 'Lo necesito para una actividad de clase';

    await elements.get('submit-unblock-request')?.trigger('click');

    assert.match(elements.get('request-status')?.textContent ?? '', /avisa a tu profesor/);
  });
});
