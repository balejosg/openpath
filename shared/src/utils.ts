import { z } from 'zod';

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Normalize domain names and emails
 */
export const normalize = {
  domain: (domain: string): string => domain.toLowerCase().trim(),
  email: (email: string): string => email.toLowerCase().trim(),
};

/**
 * Parse environment variables safely
 */
export const parseEnv = {
  int: (value: string | undefined, fallback: number): number => {
    if (value === undefined || value === '') return fallback;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  },
  list: (value: string | undefined, fallback: string[]): string[] => {
    if (value === undefined || value === '') return fallback;
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  },
  bool: (value: string | undefined, fallback: boolean): boolean => {
    if (value === undefined || value === '') return fallback;
    return value.toLowerCase() === 'true' || value === '1';
  },
};

/**
 * Safe JSON parse with Zod validation
 */
export function safeJsonParse<T>(
  json: string,
  schema: z.ZodType<T>
): { success: true; data: T } | { success: false; error: z.ZodError | Error } {
  try {
    const parsed: unknown = JSON.parse(json);
    const result = schema.safeParse(parsed);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e : new Error('Invalid JSON'),
    };
  }
}

/**
 * Validate API response with Zod schema
 */
export async function parseApiResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const json: unknown = await response.json();
  return schema.parse(json);
}
