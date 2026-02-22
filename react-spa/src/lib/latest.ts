export interface LatestGuard {
  next: () => number;
  isLatest: (seq: number) => boolean;
}

/**
 * Creates a simple "latest call wins" guard.
 *
 * Use it to prevent stale async results from overwriting newer UI state.
 * Store the guard in a React `useRef` so it persists across renders.
 */
export function createLatestGuard(): LatestGuard {
  let current = 0;

  return {
    next: () => {
      current += 1;
      return current;
    },
    isLatest: (seq: number) => seq === current,
  };
}
