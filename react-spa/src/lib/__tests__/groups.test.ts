import { describe, expect, it } from 'vitest';

import { isGroupEnabledLike } from '../groups';

describe('isGroupEnabledLike', () => {
  it('prefers explicit enabled boolean when provided', () => {
    expect(isGroupEnabledLike({ enabled: true, status: 'Inactive' })).toBe(true);
    expect(isGroupEnabledLike({ enabled: false, status: 'Active' })).toBe(false);
  });

  it('supports numeric enabled values (1/0)', () => {
    expect(isGroupEnabledLike({ enabled: 1 })).toBe(true);
    expect(isGroupEnabledLike({ enabled: 0 })).toBe(false);
  });

  it('falls back to status when enabled is missing', () => {
    expect(isGroupEnabledLike({ status: 'Active' })).toBe(true);
    expect(isGroupEnabledLike({ status: 'Inactive' })).toBe(false);
    expect(isGroupEnabledLike({ status: 'active' })).toBe(true);
    expect(isGroupEnabledLike({ status: 'inactive' })).toBe(false);
  });

  it('defaults to enabled when no signals are present', () => {
    expect(isGroupEnabledLike({})).toBe(true);
    expect(isGroupEnabledLike({ status: 'unknown' })).toBe(true);
    expect(isGroupEnabledLike({ enabled: null, status: null })).toBe(true);
  });
});
