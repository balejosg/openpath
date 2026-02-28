import { describe, expect, it } from 'vitest';

import { escapeCsvCell, toCsv } from '../csv';

describe('csv', () => {
  it('escapes quotes and always wraps in quotes', () => {
    expect(escapeCsvCell('simple')).toBe('"simple"');
    expect(escapeCsvCell('a"b')).toBe('"a""b"');
  });

  it('serializes rows into CSV', () => {
    expect(toCsv([['a', 'b']])).toBe('"a","b"');
    expect(
      toCsv([
        ['a', 'b'],
        ['c', 'd'],
      ])
    ).toBe('"a","b"\n"c","d"');
  });

  it('stringifies non-string values and treats nullish as empty', () => {
    expect(toCsv([[null, undefined, 0, true, false]])).toBe('"","","0","true","false"');
  });
});
