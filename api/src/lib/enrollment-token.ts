import { JWT_SECRET } from './auth.js';

import jwt, { type SignOptions } from 'jsonwebtoken';

const ENROLLMENT_TOKEN_ISSUER = 'openpath-api';
const ENROLLMENT_TOKEN_AUDIENCE = 'openpath-enroll';
const DEFAULT_EXPIRES_IN = '15m';

export interface EnrollmentTokenPayload {
  typ: 'enroll';
  classroomId: string;
}

export function generateEnrollmentToken(
  classroomId: string,
  expiresIn = DEFAULT_EXPIRES_IN
): string {
  const payload: EnrollmentTokenPayload = {
    typ: 'enroll',
    classroomId,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn,
    issuer: ENROLLMENT_TOKEN_ISSUER,
    audience: ENROLLMENT_TOKEN_AUDIENCE,
  } as SignOptions);
}

export function verifyEnrollmentToken(token: string): EnrollmentTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: ENROLLMENT_TOKEN_ISSUER,
      audience: ENROLLMENT_TOKEN_AUDIENCE,
    }) as unknown;

    if (decoded === null || decoded === undefined || typeof decoded !== 'object') return null;
    const rec = decoded as Record<string, unknown>;

    if (rec.typ !== 'enroll') return null;
    if (typeof rec.classroomId !== 'string' || rec.classroomId.length === 0) return null;

    return { typ: 'enroll', classroomId: rec.classroomId };
  } catch {
    return null;
  }
}
