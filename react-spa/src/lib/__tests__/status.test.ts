import { describe, expect, it } from 'vitest';

import {
  getEsActiveInactiveLabel,
  getEsActiveInactiveLabelSafe,
  normalizeActiveInactiveStatus,
} from '../status';

describe('status helpers', () => {
  it('normalizes active/inactive strings', () => {
    expect(normalizeActiveInactiveStatus('Active')).toBe('Active');
    expect(normalizeActiveInactiveStatus('Inactive')).toBe('Inactive');
    expect(normalizeActiveInactiveStatus('active')).toBe('Active');
    expect(normalizeActiveInactiveStatus('inactive')).toBe('Inactive');
    expect(normalizeActiveInactiveStatus('other')).toBe(null);
    expect(normalizeActiveInactiveStatus(null)).toBe(null);
  });

  it('returns Spanish labels for Active/Inactive', () => {
    expect(getEsActiveInactiveLabel('Active')).toBe('Activo');
    expect(getEsActiveInactiveLabel('Inactive')).toBe('Inactivo');
  });

  it('returns a safe label for unknown values', () => {
    expect(getEsActiveInactiveLabelSafe('active')).toBe('Activo');
    expect(getEsActiveInactiveLabelSafe('unknown')).toBe('Desconocido');
    expect(getEsActiveInactiveLabelSafe('unknown', 'N/A')).toBe('N/A');
  });
});
