import { useCallback, useEffect, useState } from 'react';

import type { User } from '../types';
import { trpc } from '../lib/trpc';
import { mapBackendRoleToUserRole } from '../lib/roles';

interface ApiUserLike {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roles: { role: string }[];
}

function parseApiUserLike(value: unknown): ApiUserLike | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;

  const id = obj.id;
  const name = obj.name;
  const email = obj.email;
  const isActive = obj.isActive;

  if (typeof id !== 'string') return null;
  if (typeof name !== 'string') return null;
  if (typeof email !== 'string') return null;
  if (typeof isActive !== 'boolean') return null;

  const rolesRaw = obj.roles;
  const roles: { role: string }[] = [];
  if (Array.isArray(rolesRaw)) {
    for (const r of rolesRaw) {
      if (!r || typeof r !== 'object') continue;
      const role = (r as Record<string, unknown>).role;
      if (typeof role !== 'string') continue;
      roles.push({ role });
    }
  }

  return { id, name, email, isActive, roles };
}

function mapApiUserToUser(u: ApiUserLike): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    roles: Array.isArray(u.roles) ? u.roles.map((r) => mapBackendRoleToUserRole(r.role)) : [],
    status: u.isActive ? 'Active' : 'Inactive',
  };
}

export function useUsersList(): {
  users: User[];
  loading: boolean;
  error: string | null;
  fetchUsers: () => Promise<void>;
  upsertApiUser: (apiUser: unknown) => boolean;
} {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const apiUsers = await trpc.users.list.query();
      const mapped: User[] = [];

      if (Array.isArray(apiUsers)) {
        for (const u of apiUsers) {
          const parsed = parseApiUserLike(u);
          if (!parsed) continue;
          mapped.push(mapApiUserToUser(parsed));
        }
      }

      setUsers(mapped);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setError('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  const upsertApiUser = useCallback((apiUser: unknown): boolean => {
    const parsed = parseApiUserLike(apiUser);
    if (!parsed) return false;

    const next = mapApiUserToUser(parsed);
    setUsers((prev) => [next, ...prev.filter((u) => u.id !== next.id)]);
    return true;
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  return { users, loading, error, fetchUsers, upsertApiUser };
}
