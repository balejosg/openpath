import { describe, it, expect } from 'vitest';
import { relativeTime } from '../utils';

describe('relativeTime() function', () => {
  it('should return "just now" for current time', () => {
    const now = new Date().toISOString();
    expect(relativeTime(now)).toBe('just now');
  });

  it('should return minutes for recent times', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(relativeTime(fiveMinAgo)).toBe('5 min ago');
  });

  it('should return hours for older times', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(twoHoursAgo)).toBe('2h ago');
  });

  it('should return days for old times', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(threeDaysAgo)).toBe('3 days ago');
  });

  it('should return date for very old times', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const result = relativeTime(twoWeeksAgo);
    // Should be a date format, not relative
    expect(result).not.toContain('ago');
    expect(result).not.toBe('just now');
  });
});
