export const ACTIVE_INACTIVE_LABELS_ES = {
  Active: 'Activo',
  Inactive: 'Inactivo',
} as const;

export type ActiveInactiveStatus = keyof typeof ACTIVE_INACTIVE_LABELS_ES;

export function normalizeActiveInactiveStatus(value: unknown): ActiveInactiveStatus | null {
  if (value === 'Active' || value === 'Inactive') return value;
  if (typeof value !== 'string') return null;

  const lowered = value.toLowerCase();
  if (lowered === 'active') return 'Active';
  if (lowered === 'inactive') return 'Inactive';
  return null;
}

export function getEsActiveInactiveLabel(status: ActiveInactiveStatus): string {
  return ACTIVE_INACTIVE_LABELS_ES[status];
}

export function getEsActiveInactiveLabelSafe(value: unknown, fallback = 'Desconocido'): string {
  const normalized = normalizeActiveInactiveStatus(value);
  if (!normalized) return fallback;
  return getEsActiveInactiveLabel(normalized);
}
