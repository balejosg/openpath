import { TRPCError } from '@trpc/server';

import type {
  ClassroomServiceError,
  CreateClassroomInput,
  UpdateClassroomData,
} from '../../../services/classroom.service.js';

export function throwClassroomServiceError(error: ClassroomServiceError): never {
  throw new TRPCError({ code: error.code, message: error.message });
}

export function toCreateClassroomInput(input: {
  name: string;
  displayName?: string | undefined;
  defaultGroupId?: string | undefined;
}): CreateClassroomInput {
  return {
    name: input.name,
    displayName: input.displayName ?? input.name,
    ...(input.defaultGroupId !== undefined ? { defaultGroupId: input.defaultGroupId } : {}),
  };
}

export function toUpdateClassroomData(input: {
  displayName?: string | undefined;
  defaultGroupId?: string | null | undefined;
}): UpdateClassroomData {
  return {
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(typeof input.defaultGroupId === 'string' ? { defaultGroupId: input.defaultGroupId } : {}),
  };
}
