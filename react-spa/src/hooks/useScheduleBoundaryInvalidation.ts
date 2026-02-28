import { useEffect, useRef } from 'react';
import type { ScheduleWithPermissions } from '../types';
import { parseTimeOfDayToMinutes } from '../lib/time-of-day';

export type ScheduleBoundaryLike = Pick<
  ScheduleWithPermissions,
  'dayOfWeek' | 'startTime' | 'endTime'
>;

function computeNextOccurrenceAt(now: Date, dayOfWeek: number, time: string): Date | null {
  const minutes = parseTimeOfDayToMinutes(time);
  if (minutes === null) return null;

  // JS Date.getDay(): 0=Sun..6=Sat. Our schedule uses 1=Mon..5=Fri.
  const normalizedDay = dayOfWeek === 7 ? 0 : dayOfWeek;
  if (!Number.isInteger(normalizedDay) || normalizedDay < 0 || normalizedDay > 6) return null;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  const nowDay = now.getDay();
  const daysUntil = (normalizedDay - nowDay + 7) % 7;

  const candidate = new Date(now);
  candidate.setDate(now.getDate() + daysUntil);
  candidate.setHours(hours, mins, 0, 0);

  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 7);
  }

  return candidate;
}

export function getNextScheduleBoundaryAt(
  schedules: readonly ScheduleBoundaryLike[],
  now: Date
): Date | null {
  let best: Date | null = null;

  for (const s of schedules) {
    const startMin = parseTimeOfDayToMinutes(s.startTime);
    const endMin = parseTimeOfDayToMinutes(s.endTime);
    if (startMin === null || endMin === null) continue;
    if (endMin <= startMin) continue;

    const candidates = [
      computeNextOccurrenceAt(now, s.dayOfWeek, s.startTime),
      computeNextOccurrenceAt(now, s.dayOfWeek, s.endTime),
    ].filter((d): d is Date => d !== null);

    for (const c of candidates) {
      if (!best || c.getTime() < best.getTime()) {
        best = c;
      }
    }
  }

  return best;
}

interface UseScheduleBoundaryInvalidationParams {
  schedules: readonly ScheduleBoundaryLike[];
  enabled?: boolean;
  onBoundary: () => void;
  /** Extra delay after boundary to avoid firing early (ms). */
  fireDelayMs?: number;
}

export function useScheduleBoundaryInvalidation({
  schedules,
  enabled = true,
  onBoundary,
  fireDelayMs = 1000,
}: UseScheduleBoundaryInvalidationParams): void {
  const onBoundaryRef = useRef(onBoundary);
  onBoundaryRef.current = onBoundary;

  useEffect(() => {
    if (!enabled) return;
    if (schedules.length === 0) return;

    let cancelled = false;
    let timeoutId: number | undefined;

    const scheduleNext = () => {
      if (cancelled) return;

      const nextAt = getNextScheduleBoundaryAt(schedules, new Date());
      if (!nextAt) return;

      const msUntil = Math.max(nextAt.getTime() - Date.now() + fireDelayMs, 0);

      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        try {
          onBoundaryRef.current();
        } finally {
          scheduleNext();
        }
      }, msUntil);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [enabled, schedules, fireDelayMs]);
}
