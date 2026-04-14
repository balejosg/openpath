export interface SetupStatus {
  needsSetup: boolean;
  hasAdmin: boolean;
}

export interface CreateFirstAdminInput {
  email: string;
  name: string;
  password: string;
}

export interface CreateFirstAdminResult {
  success: true;
  registrationToken: string;
  user: { id: string; email: string; name: string };
}

export type SetupServiceError =
  | { code: 'SETUP_ALREADY_COMPLETED'; message: string }
  | { code: 'EMAIL_EXISTS'; message: string }
  | { code: 'INVALID_INPUT'; message: string; field: string }
  | { code: 'SETUP_NOT_COMPLETED'; message: string };

export type SetupResult<T> = { ok: true; data: T } | { ok: false; error: SetupServiceError };
