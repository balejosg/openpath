import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getNextScheduleBoundaryAt,
  useScheduleBoundaryInvalidation,
  type ScheduleBoundaryLike,
} from '../useScheduleBoundaryInvalidation';

function makeSchedule(overrides: Partial<ScheduleBoundaryLike> = {}): ScheduleBoundaryLike {
  return {
    dayOfWeek: 1,
    startTime: '10:00',
    endTime: '11:00',
    ...overrides,
  };
}

describe('useScheduleBoundaryInvalidation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  describe('getNextScheduleBoundaryAt', () => {
    it('returns the next start boundary when before a block', () => {
      const now = new Date(2026, 1, 23, 9, 0, 0, 0); // Mon
      const next = getNextScheduleBoundaryAt([makeSchedule()], now);
      expect(next?.getTime()).toBe(new Date(2026, 1, 23, 10, 0, 0, 0).getTime());
    });

    it('returns the next end boundary when inside a block', () => {
      const now = new Date(2026, 1, 23, 10, 30, 0, 0); // Mon
      const next = getNextScheduleBoundaryAt([makeSchedule()], now);
      expect(next?.getTime()).toBe(new Date(2026, 1, 23, 11, 0, 0, 0).getTime());
    });

    it('chooses the earliest boundary across schedules', () => {
      const now = new Date(2026, 1, 23, 9, 0, 0, 0); // Mon
      const next = getNextScheduleBoundaryAt(
        [
          makeSchedule({ startTime: '12:00', endTime: '13:00' }),
          makeSchedule({ startTime: '10:15', endTime: '11:00' }),
        ],
        now
      );
      expect(next?.getTime()).toBe(new Date(2026, 1, 23, 10, 15, 0, 0).getTime());
    });
  });

  it('fires onBoundary at the next boundary and reschedules', () => {
    const onBoundary = vi.fn();
    const start = new Date(2026, 1, 23, 9, 0, 0, 0);
    vi.setSystemTime(start);

    renderHook(() =>
      useScheduleBoundaryInvalidation({
        schedules: [makeSchedule()],
        onBoundary,
        fireDelayMs: 0,
      })
    );

    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000 - 1);
    });
    expect(onBoundary).toHaveBeenCalledTimes(0);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onBoundary).toHaveBeenCalledTimes(1);

    // Next boundary should be the end time (11:00)
    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });
    expect(onBoundary).toHaveBeenCalledTimes(2);
  });

  it('does nothing when disabled', () => {
    const onBoundary = vi.fn();
    vi.setSystemTime(new Date(2026, 1, 23, 9, 0, 0, 0));

    renderHook(() =>
      useScheduleBoundaryInvalidation({
        schedules: [makeSchedule()],
        onBoundary,
        enabled: false,
        fireDelayMs: 0,
      })
    );

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    });
    expect(onBoundary).toHaveBeenCalledTimes(0);
  });
});
