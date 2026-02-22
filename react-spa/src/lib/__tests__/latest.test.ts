import { describe, it, expect } from 'vitest';
import { createLatestGuard } from '../latest';

describe('latest', () => {
  it('tracks the latest sequence id', () => {
    const guard = createLatestGuard();

    const first = guard.next();
    expect(first).toBe(1);
    expect(guard.isLatest(first)).toBe(true);

    const second = guard.next();
    expect(second).toBe(2);
    expect(guard.isLatest(first)).toBe(false);
    expect(guard.isLatest(second)).toBe(true);
  });
});
