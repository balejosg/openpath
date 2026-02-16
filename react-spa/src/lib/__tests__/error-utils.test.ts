import { describe, expect, it } from 'vitest';
import { normalizeErrorMessage, resolveErrorMessage } from '../error-utils';

describe('error-utils', () => {
  it('normalizes Error messages to lowercase', () => {
    expect(normalizeErrorMessage(new Error('Invalid Email'))).toBe('invalid email');
  });

  it('normalizes non-Error values to lowercase strings', () => {
    expect(normalizeErrorMessage('BAD_REQUEST')).toBe('bad_request');
  });

  it('returns first matching rule message', () => {
    const result = resolveErrorMessage(
      new Error('User already exists'),
      [
        { message: 'Email duplicado', patterns: ['duplicate', 'already exists'] },
        { message: 'Email inválido', patterns: ['invalid email'] },
      ],
      'Fallback'
    );

    expect(result).toBe('Email duplicado');
  });

  it('returns fallback message when no rule matches', () => {
    const result = resolveErrorMessage(
      new Error('unexpected backend failure'),
      [{ message: 'Email inválido', patterns: ['invalid email'] }],
      'Error genérico'
    );

    expect(result).toBe('Error genérico');
  });
});
