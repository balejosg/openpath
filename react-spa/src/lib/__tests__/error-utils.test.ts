import { describe, expect, it } from 'vitest';
import {
  getTrpcErrorCode,
  isDuplicateError,
  normalizeErrorMessage,
  resolveErrorMessage,
} from '../error-utils';

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

  it('detects duplicate/conflict-like errors', () => {
    expect(isDuplicateError(new Error('CONFLICT'))).toBe(true);
    expect(isDuplicateError(new Error('Rule already exists'))).toBe(true);
    expect(isDuplicateError(new Error('Duplicate key'))).toBe(true);
    expect(isDuplicateError(new Error('Ya existe'))).toBe(true);
    expect(isDuplicateError(new Error('Some other error'))).toBe(false);
  });

  it('extracts tRPC error codes from common shapes', () => {
    expect(getTrpcErrorCode({ data: { code: 'CONFLICT' } })).toBe('CONFLICT');
    expect(getTrpcErrorCode({ shape: { code: 'BAD_REQUEST' } })).toBe('BAD_REQUEST');
    expect(getTrpcErrorCode({ shape: { data: { code: 'FORBIDDEN' } } })).toBe('FORBIDDEN');
    expect(getTrpcErrorCode({ error: { data: { code: 'NOT_FOUND' } } })).toBe('NOT_FOUND');
    expect(getTrpcErrorCode(new Error('oops'))).toBeNull();
    expect(getTrpcErrorCode('nope')).toBeNull();
  });
});
