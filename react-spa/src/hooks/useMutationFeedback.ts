import { useCallback, useState } from 'react';
import { resolveTrpcErrorMessage } from '../lib/error-utils';

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
  return resolveTrpcErrorMessage(err, {
    badRequest: messages.badRequest,
    conflict: messages.conflict,
    forbidden: messages.forbidden ?? messages.fallback,
    unauthorized: messages.forbidden ?? messages.fallback,
    fallback: messages.fallback,
  });
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
