import { describe, expect, it } from 'vitest';
import { resolveMutationFeedback } from '../useMutationFeedback';

describe('resolveMutationFeedback', () => {
  const messages = {
    badRequest: 'Revisa los datos enviados.',
    conflict: 'Existe un conflicto con el estado actual.',
    fallback: 'No se pudo guardar la configuracion. Intenta nuevamente.',
  };

  it('maps BAD_REQUEST/400 style errors to badRequest message', () => {
    expect(resolveMutationFeedback(new Error('BAD_REQUEST: groups.update 400'), messages)).toBe(
      messages.badRequest
    );
  });

  it('maps CONFLICT/409 style errors to conflict message', () => {
    expect(resolveMutationFeedback(new Error('CONFLICT: 409 duplicate'), messages)).toBe(
      messages.conflict
    );
  });

  it('maps tRPC error codes to messages when available', () => {
    expect(resolveMutationFeedback({ data: { code: 'BAD_REQUEST' } }, messages)).toBe(
      messages.badRequest
    );
    expect(resolveMutationFeedback({ data: { code: 'CONFLICT' } }, messages)).toBe(
      messages.conflict
    );
  });

  it('falls back to generic message when no rule matches', () => {
    expect(resolveMutationFeedback(new Error('unknown upstream timeout'), messages)).toBe(
      messages.fallback
    );
  });
});
