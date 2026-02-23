import { useState, useEffect, useCallback } from 'react';
import { trpc } from '../lib/trpc';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  initials: string;
  primaryRole: string;
}

interface UseCurrentUserResult {
  user: CurrentUser | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and cache the current authenticated user's profile.
 * Uses trpc.auth.me to get user data.
 */
export function useCurrentUser(): UseCurrentUserResult {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await trpc.auth.me.query();
      const profile = response.user;

      // Extract roles from the roles array
      const roles = profile.roles.map((r) => r.role);

      // Get initials from name (first letter of first two words)
      const nameParts = profile.name.split(' ').filter(Boolean);
      const initials = nameParts
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase();

      // Determine primary role for display
      const roleHierarchy = ['admin', 'teacher'] as const;
      const foundRole = roleHierarchy.find((r) => roles.includes(r));
      const primaryRole = foundRole ?? 'user';

      setUser({
        id: profile.id,
        name: profile.name,
        email: profile.email,
        roles,
        initials: initials || '??',
        primaryRole,
      });
    } catch (err) {
      console.error('Failed to fetch current user:', err);
      setError('Error al cargar perfil de usuario');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  return { user, loading, error, refetch: fetchUser };
}

/**
 * Get display label for a role.
 */
export function getRoleDisplayLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Admin',
    teacher: 'Profesor',
    student: 'Usuario',
    viewer: 'Usuario',
    user: 'Usuario',
  };
  return labels[role] ?? role;
}
