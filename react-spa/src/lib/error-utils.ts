export interface ErrorRule {
  message: string;
  patterns: string[];
}

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
