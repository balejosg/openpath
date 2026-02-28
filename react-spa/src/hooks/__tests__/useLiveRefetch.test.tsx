import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useIntervalRefetch, useRefetchOnFocus } from '../useLiveRefetch';

describe('useIntervalRefetch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls the callback on the configured interval when enabled', () => {
    const callback = vi.fn();

    renderHook(() => useIntervalRefetch(callback, 1000, { enabled: true }));

    expect(callback).toHaveBeenCalledTimes(0);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('does not start an interval when disabled', () => {
    const callback = vi.fn();

    renderHook(() => useIntervalRefetch(callback, 1000, { enabled: false }));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(callback).toHaveBeenCalledTimes(0);
  });

  it('cleans up the interval on unmount', () => {
    const callback = vi.fn();

    const { unmount } = renderHook(() => useIntervalRefetch(callback, 1000, { enabled: true }));

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('useRefetchOnFocus', () => {
  it('calls the callback when the window receives focus', () => {
    const callback = vi.fn();

    renderHook(() => useRefetchOnFocus(callback));

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('removes the focus listener on unmount', () => {
    const callback = vi.fn();

    const { unmount } = renderHook(() => useRefetchOnFocus(callback));
    unmount();

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(callback).toHaveBeenCalledTimes(0);
  });
});
