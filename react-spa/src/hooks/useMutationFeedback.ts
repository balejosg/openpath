import { useCallback, useState } from 'react';
import { getTrpcErrorCode, resolveErrorMessage } from '../lib/error-utils';

export interface MutationFeedbackMessages {
  badRequest: string;
  conflict: string;
  forbidden?: string;
  fallback: string;
}

export const resolveMutationFeedback = (
  err: unknown,
  messages: MutationFeedbackMessages
): string => {
  const code = getTrpcErrorCode(err);
  if (code === 'BAD_REQUEST') {
    return messages.badRequest;
  }
  if (code === 'CONFLICT') {
    return messages.conflict;
  }
  if (code === 'FORBIDDEN' || code === 'UNAUTHORIZED') {
    return messages.forbidden ?? messages.fallback;
  }

  return resolveErrorMessage(
    err,
    [
      { message: messages.badRequest, patterns: ['bad_request', '400', 'invalid', 'validation'] },
      { message: messages.conflict, patterns: ['conflict', '409', 'already exists', 'duplicate'] },
      {
        message: messages.forbidden ?? messages.fallback,
        patterns: ['forbidden', 'unauthorized', '403'],
      },
    ],
    messages.fallback
  );
};

export const useMutationFeedback = (defaultMessages: MutationFeedbackMessages) => {
  const [error, setError] = useState('');

  const clearError = useCallback(() => {
    setError('');
  }, []);

  const captureError = useCallback(
    (err: unknown, overrideMessages?: Partial<MutationFeedbackMessages>): string => {
      const messages = { ...defaultMessages, ...overrideMessages };
      const resolved = resolveMutationFeedback(err, messages);
      setError(resolved);
      return resolved;
    },
    [defaultMessages]
  );

  return {
    error,
    setError,
    clearError,
    captureError,
  };
};
