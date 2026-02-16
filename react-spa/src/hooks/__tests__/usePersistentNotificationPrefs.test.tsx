import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  NOTIFICATION_PREFS_KEY,
  usePersistentNotificationPrefs,
} from '../usePersistentNotificationPrefs';

describe('usePersistentNotificationPrefs', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('loads defaults when localStorage is empty', () => {
    const { result } = renderHook(() => usePersistentNotificationPrefs());

    expect(result.current.prefs).toEqual({
      securityAlerts: true,
      domainRequests: true,
      weeklyReports: false,
    });
  });

  it('loads persisted values from localStorage', () => {
    window.localStorage.setItem(
      NOTIFICATION_PREFS_KEY,
      JSON.stringify({
        securityAlerts: false,
        domainRequests: true,
        weeklyReports: true,
      })
    );

    const { result } = renderHook(() => usePersistentNotificationPrefs());

    expect(result.current.prefs).toEqual({
      securityAlerts: false,
      domainRequests: true,
      weeklyReports: true,
    });
  });

  it('persists updates to localStorage', async () => {
    const { result } = renderHook(() => usePersistentNotificationPrefs());

    act(() => {
      result.current.setPrefs((previous) => ({ ...previous, weeklyReports: true }));
    });

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(NOTIFICATION_PREFS_KEY) ?? '{}') as {
        weeklyReports?: boolean;
      };
      expect(stored.weeklyReports).toBe(true);
    });
  });
});
