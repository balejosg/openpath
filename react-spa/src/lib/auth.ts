import { trpc } from './trpc';
import {
  ACCESS_TOKEN_KEY,
  USER_KEY,
  clearAuthStorage,
  getAccessToken,
  getUserJson,
  setAuthSession,
} from './auth-storage';

export interface User {
  id: string;
  email: string;
  name: string;
  roles: {
    role: 'admin' | 'teacher' | 'student' | 'user';
    groupIds?: string[];
  }[];
}

/**
 * Obtiene el usuario actual desde localStorage.
 */
export function getCurrentUser(): User | null {
  const userJson = getUserJson();
  if (!userJson) return null;
  try {
    return JSON.parse(userJson) as User;
  } catch {
    return null;
  }
}

/**
 * Verifica si el usuario está autenticado.
 */
export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

/**
 * Verifica si el usuario es admin.
 */
export function isAdmin(): boolean {
  const user = getCurrentUser();
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.some((r) => r.role === 'admin');
}

/**
 * Verifica si el usuario es profesor.
 */
export function isTeacher(): boolean {
  const user = getCurrentUser();
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.some((r) => r.role === 'teacher');
}

/**
 * Verifica si el usuario es estudiante.
 */
export function isStudent(): boolean {
  const user = getCurrentUser();
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.some((r) => r.role === 'student');
}

const TEACHER_GROUPS_FEATURE_KEY = 'openpath_teacher_groups_enabled';

/**
 * Feature flag: allow teachers to create/manage their own groups in the UI.
 * Disabled by default to preserve legacy deployments.
 */
export function isTeacherGroupsFeatureEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(TEACHER_GROUPS_FEATURE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Realiza login con email y password.
 */
export async function login(email: string, password: string): Promise<User> {
  const result = await trpc.auth.login.mutate({ email, password });

  // Guardar tokens
  setAuthSession(result.accessToken, result.refreshToken, result.user);

  return result.user;
}

/**
 * Realiza login con Google.
 */
export async function loginWithGoogle(idToken: string): Promise<User> {
  const result = await trpc.auth.googleLogin.mutate({ idToken });

  // Guardar tokens
  setAuthSession(result.accessToken, result.refreshToken, result.user);

  return result.user;
}

/**
 * Cierra la sesión actual.
 */
export function logout(): void {
  void trpc.auth.logout
    .mutate({})
    .catch(() => {
      // Ignore network/auth errors during logout cleanup.
    })
    .finally(() => {
      clearAuthStorage();

      // Recargar para limpiar estado
      window.location.reload();
    });
}

/**
 * Escucha cambios de autenticación desde otras pestañas.
 */
export function onAuthChange(callback: () => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === ACCESS_TOKEN_KEY || e.key === USER_KEY) {
      callback();
    }
  };
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('storage', handler);
  };
}
