import { useEffect } from 'react';

export interface UseIntervalRefetchOptions {
  enabled?: boolean;
}

export function useIntervalRefetch(
  callback: () => void | Promise<void>,
  intervalMs: number,
  options: UseIntervalRefetchOptions = {}
): void {
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;

    const id = window.setInterval(() => {
      void callback();
    }, intervalMs);

    return () => {
      window.clearInterval(id);
    };
  }, [callback, enabled, intervalMs]);
}

export interface UseRefetchOnFocusOptions {
  enabled?: boolean;
}

export function useRefetchOnFocus(
  callback: () => void | Promise<void>,
  options: UseRefetchOnFocusOptions = {}
): void {
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const onFocus = () => {
      void callback();
    };

    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [callback, enabled]);
}
