import { trpc } from './trpc';

// Claves de localStorage (compatibilidad con SPA vanilla)
const ACCESS_TOKEN_KEY = 'openpath_access_token';
const REFRESH_TOKEN_KEY = 'openpath_refresh_token';
const USER_KEY = 'openpath_user';

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
  const userJson = localStorage.getItem(USER_KEY);
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

/**
 * Verifica si el usuario está autenticado.
 */
export function isAuthenticated(): boolean {
  return !!localStorage.getItem(ACCESS_TOKEN_KEY);
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

/**
 * Obtiene los grupos asignados al profesor.
 */
export function getTeacherGroups(): string[] {
  const user = getCurrentUser();
  if (!user || !Array.isArray(user.roles)) return [];

  const groups = new Set<string>();
  user.roles
    .filter((r) => r.role === 'teacher')
    .forEach((r) => {
      (r.groupIds ?? []).forEach((g) => groups.add(g));
    });

  return Array.from(groups);
}

/**
 * Realiza login con email y password.
 */
export async function login(email: string, password: string): Promise<User> {
  const result = await trpc.auth.login.mutate({ email, password });

  // Guardar tokens
  localStorage.setItem(ACCESS_TOKEN_KEY, result.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(result.user));

  // Note: API's LoginResponse.user is typed as SafeUser (without roles),
  // but AuthService.login actually returns user with roles at runtime.
  // See: api/src/services/auth.service.ts:110-130
  // TODO: Fix API types to match runtime behavior
  return result.user as unknown as User;
}

/**
 * Realiza login con Google.
 */
export async function loginWithGoogle(idToken: string): Promise<User> {
  const result = await trpc.auth.googleLogin.mutate({ idToken });

  // Guardar tokens
  localStorage.setItem(ACCESS_TOKEN_KEY, result.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(result.user));

  return result.user as unknown as User;
}

/**
 * Cierra la sesión actual.
 */
export function logout(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);

  // Recargar para limpiar estado
  window.location.reload();
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
