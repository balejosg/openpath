export interface ErrorRule {
  message: string;
  patterns: string[];
}

const DUPLICATE_PATTERNS = ['conflict', 'already exists', 'duplicate', 'ya existe'] as const;

export const normalizeErrorMessage = (err: unknown): string => {
  if (err instanceof Error) {
    return err.message.toLowerCase();
  }

  return String(err).toLowerCase();
};

export const resolveErrorMessage = (
  err: unknown,
  rules: ErrorRule[],
  fallbackMessage: string
): string => {
  const normalized = normalizeErrorMessage(err);

  const matchedRule = rules.find((rule) =>
    rule.patterns.some((pattern) => normalized.includes(pattern.toLowerCase()))
  );

  return matchedRule?.message ?? fallbackMessage;
};

export const isDuplicateError = (err: unknown): boolean => {
  const normalized = normalizeErrorMessage(err);
  return DUPLICATE_PATTERNS.some((pattern) => normalized.includes(pattern));
};
