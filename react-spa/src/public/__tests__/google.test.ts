import { describe, expect, it } from 'vitest';

import * as publicGoogle from '../google';

describe('public google surface', () => {
  it('loads the public google types module', () => {
    expect(typeof publicGoogle).toBe('object');
  });
});
