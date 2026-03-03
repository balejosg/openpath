import { normalizeActiveInactiveStatus } from './status';

export interface GroupEnabledLike {
  enabled?: boolean | number | null;
  status?: string | null;
}

export function isGroupEnabledLike(group: GroupEnabledLike): boolean {
  const enabledValue = group.enabled;

  if (typeof enabledValue === 'boolean') return enabledValue;
  if (typeof enabledValue === 'number') return enabledValue === 1;

  const normalized = normalizeActiveInactiveStatus(group.status);
  if (normalized === 'Active') return true;
  if (normalized === 'Inactive') return false;

  return true;
}
