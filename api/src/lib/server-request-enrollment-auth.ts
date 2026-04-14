import type { Request, Response } from 'express';

import * as classroomStorage from './classroom-storage.js';
import { verifyEnrollmentToken } from './enrollment-token.js';

export interface AuthenticatedEnrollment {
  classroomId: string;
  classroomName: string;
  enrollmentToken: string;
}

export async function authenticateEnrollmentToken(
  req: Request,
  res: Response
): Promise<AuthenticatedEnrollment | null> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ') !== true) {
    res.status(401).json({ success: false, error: 'Authorization header required' });
    return null;
  }

  const enrollmentToken = authHeader.slice(7);
  if (!enrollmentToken) {
    res.status(401).json({ success: false, error: 'Enrollment token required' });
    return null;
  }

  const payload = verifyEnrollmentToken(enrollmentToken);
  if (!payload) {
    res.status(403).json({ success: false, error: 'Invalid enrollment token' });
    return null;
  }

  const classroom = await classroomStorage.getClassroomById(payload.classroomId);
  if (!classroom) {
    res.status(404).json({ success: false, error: 'Classroom not found' });
    return null;
  }

  return {
    classroomId: classroom.id,
    classroomName: classroom.name,
    enrollmentToken,
  };
}
