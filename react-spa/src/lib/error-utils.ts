export interface ErrorRule {
  message: string;
  patterns: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export const getTrpcErrorCode = (err: unknown): string | null => {
  if (!isRecord(err)) {
    return null;
  }

  const data = isRecord(err.data) ? err.data : null;
  const shape = isRecord(err.shape) ? err.shape : null;
  const nestedError = isRecord(err.error) ? err.error : null;

  const readCode = (value: unknown): string | null => (typeof value === 'string' ? value : null);

  if (data) {
    const code = readCode(data.code);
    if (code) return code;
  }

  if (shape) {
    const code = readCode(shape.code);
    if (code) return code;

    const shapeData = isRecord(shape.data) ? shape.data : null;
    if (shapeData) {
      const codeFromShapeData = readCode(shapeData.code);
      if (codeFromShapeData) return codeFromShapeData;
    }
  }

  if (nestedError) {
    const nestedData = isRecord(nestedError.data) ? nestedError.data : null;
    if (nestedData) {
      const code = readCode(nestedData.code);
      if (code) return code;
    }
  }

  return null;
};

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
