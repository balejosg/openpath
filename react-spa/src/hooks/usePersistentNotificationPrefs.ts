import { useEffect, useState } from 'react';

export interface NotificationPrefs {
  securityAlerts: boolean;
  domainRequests: boolean;
  weeklyReports: boolean;
}

export const NOTIFICATION_PREFS_KEY = 'openpath.notificationPrefs';

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  securityAlerts: true,
  domainRequests: true,
  weeklyReports: false,
};

const loadNotificationPrefs = (): NotificationPrefs => {
  if (typeof window === 'undefined') {
    return DEFAULT_NOTIFICATION_PREFS;
  }

  const raw = window.localStorage.getItem(NOTIFICATION_PREFS_KEY);
  if (!raw) {
    return DEFAULT_NOTIFICATION_PREFS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      securityAlerts: parsed.securityAlerts ?? DEFAULT_NOTIFICATION_PREFS.securityAlerts,
      domainRequests: parsed.domainRequests ?? DEFAULT_NOTIFICATION_PREFS.domainRequests,
      weeklyReports: parsed.weeklyReports ?? DEFAULT_NOTIFICATION_PREFS.weeklyReports,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
};

export const usePersistentNotificationPrefs = () => {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadNotificationPrefs());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  return {
    prefs,
    setPrefs,
  };
};
