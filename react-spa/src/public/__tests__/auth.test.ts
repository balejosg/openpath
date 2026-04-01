import { describe, expect, it } from 'vitest';

import * as publicAuth from '../auth';

describe('public auth surface', () => {
  it('exports stable auth helpers', () => {
    expect(typeof publicAuth.isAdmin).toBe('function');
    expect(typeof publicAuth.isAuthenticated).toBe('function');
    expect(typeof publicAuth.isStudent).toBe('function');
    expect(typeof publicAuth.isTeacher).toBe('function');
    expect(typeof publicAuth.logout).toBe('function');
  });
});
