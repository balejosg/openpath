import { useCallback, useState } from 'react';
import { resolveErrorMessage } from '../lib/error-utils';

export interface MutationFeedbackMessages {
  badRequest: string;
  conflict: string;
  forbidden?: string;
  fallback: string;
}

export const resolveMutationFeedback = (err: unknown, messages: MutationFeedbackMessages): string =>
  resolveErrorMessage(
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
