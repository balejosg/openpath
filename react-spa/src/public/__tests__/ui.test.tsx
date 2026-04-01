import { describe, expect, it } from 'vitest';

import * as publicUi from '../ui';

describe('public ui surface', () => {
  it('exports stable UI building blocks', () => {
    expect(typeof publicUi.Button).toBe('object');
    expect(typeof publicUi.Input).toBe('object');
    expect(typeof publicUi.Card).toBe('object');
    expect(typeof publicUi.Modal).toBe('function');
    expect(typeof publicUi.ConfirmDialog).toBe('function');
    expect(typeof publicUi.DangerConfirmDialog).toBe('function');
  });
});
