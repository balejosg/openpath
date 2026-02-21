export type SseJsonEvent = Record<string, unknown> & { event?: string };

export function firstSseDataPayload(writes: readonly string[]): string {
  const dataLine = writes
    .join('')
    .split('\n')
    .find((line) => line.startsWith('data: '));

  return dataLine ? dataLine.slice(6) : '';
}

export function createSseTestClient(params: { url: string; headers?: Record<string, string> }): {
  connect: () => Promise<Response>;
  waitFor: (
    predicate: (event: SseJsonEvent) => boolean,
    timeoutMs?: number,
    description?: string
  ) => Promise<SseJsonEvent>;
  close: () => void;
  rawPayloads: string[];
  events: SseJsonEvent[];
} {
  const controller = new AbortController();
  const rawPayloads: string[] = [];
  const events: SseJsonEvent[] = [];

  let response: Response | null = null;
  let started = false;
  let closed = false;

  interface Waiter {
    predicate: (event: SseJsonEvent) => boolean;
    resolve: (event: SseJsonEvent) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }

  const waiters: Waiter[] = [];

  const rejectWaiters = (error: Error): void => {
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      if (!waiter) continue;
      clearTimeout(waiter.timeoutId);
      waiter.reject(error);
    }
  };

  const maybeResolveWaiters = (event: SseJsonEvent): void => {
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      const waiter = waiters[i];
      if (!waiter) continue;

      if (!waiter.predicate(event)) {
        continue;
      }

      waiters.splice(i, 1);
      clearTimeout(waiter.timeoutId);
      waiter.resolve(event);
    }
  };

  const readLoop = async (res: Response): Promise<void> => {
    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('No reader available');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const chunkUnknown: unknown = await reader.read();
      if (typeof chunkUnknown !== 'object' || chunkUnknown === null) {
        continue;
      }

      if (!('done' in chunkUnknown) || !('value' in chunkUnknown)) {
        continue;
      }

      const chunk = chunkUnknown as { done: boolean; value?: unknown };
      if (chunk.done) {
        return;
      }

      if (!(chunk.value instanceof Uint8Array)) {
        continue;
      }

      buffer += decoder.decode(chunk.value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        rawPayloads.push(payload);

        try {
          const parsedUnknown: unknown = JSON.parse(payload);
          if (typeof parsedUnknown !== 'object' || parsedUnknown === null) {
            continue;
          }
          const parsed = parsedUnknown as SseJsonEvent;
          events.push(parsed);
          maybeResolveWaiters(parsed);
        } catch {
          // Ignore invalid JSON; keep collecting.
        }
      }
    }
  };

  const connect = async (): Promise<Response> => {
    if (closed) {
      throw new Error('SSE client is closed');
    }

    if (started && response) {
      return response;
    }

    started = true;

    try {
      const init: RequestInit = { signal: controller.signal };
      if (params.headers !== undefined) {
        init.headers = params.headers;
      }

      response = await fetch(params.url, init);

      void readLoop(response).catch((error: unknown) => {
        if (closed) return;
        rejectWaiters(error instanceof Error ? error : new Error(String(error)));
      });

      return response;
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('SSE connection aborted', { cause: error });
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  };

  const waitFor = async (
    predicate: (event: SseJsonEvent) => boolean,
    timeoutMs = 5000,
    description = 'SSE event'
  ): Promise<SseJsonEvent> => {
    if (closed) {
      throw new Error('SSE client is closed');
    }

    for (const event of events) {
      if (predicate(event)) {
        return event;
      }
    }

    return await new Promise<SseJsonEvent>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const error = new Error(`Timeout waiting for ${description}`);
        // Remove this waiter if it's still present.
        const idx = waiters.findIndex((w) => w.timeoutId === timeoutId);
        if (idx >= 0) {
          waiters.splice(idx, 1);
        }
        reject(error);
      }, timeoutMs);

      waiters.push({ predicate, resolve, reject, timeoutId });
    });
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    controller.abort();
    rejectWaiters(new Error('SSE client closed'));
  };

  return {
    connect,
    waitFor,
    close,
    rawPayloads,
    events,
  };
}
