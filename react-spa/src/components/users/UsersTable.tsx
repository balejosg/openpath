import type React from 'react';
import { AlertCircle, Edit2, Key, Loader2, Mail, Trash } from 'lucide-react';

import { getEsActiveInactiveLabel } from '../../lib/status';
import type { User } from '../../types';
import { UserRoleBadge } from './UserRoleBadge';

export interface UsersTableProps {
  deleting: boolean;
  error: string | null;
  fetchUsers: () => Promise<void>;
  fetching: boolean;
  filteredUsers: User[];
  hasData: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  hasVisibleData: boolean;
  rangeEnd: number;
  rangeStart: number;
  setPageIndex: React.Dispatch<React.SetStateAction<number>>;
  showInitialLoading: boolean;
  totalCount: number;
  visibleUsers: User[];
  onOpenEditModal: (user: User) => void;
  onRequestDeleteUser: (target: { id: string; name: string }) => void;
  onRequestPasswordReset: (user: User) => void;
}

export function UsersTable({
  deleting,
  error,
  fetchUsers,
  fetching,
  filteredUsers,
  hasData,
  hasNextPage,
  hasPreviousPage,
  hasVisibleData,
  rangeEnd,
  rangeStart,
  setPageIndex,
  showInitialLoading,
  totalCount,
  visibleUsers,
  onOpenEditModal,
  onRequestDeleteUser,
  onRequestPasswordReset,
}: UsersTableProps): React.JSX.Element {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-clip shadow-sm">
      <div className="overflow-x-auto">
        <table data-testid="users-table" className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-bold tracking-wider">
              <th className="px-6 py-4">Usuario</th>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4">Roles</th>
              <th className="px-6 py-4">Estado</th>
              <th className="px-6 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {showInitialLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
                  <span className="text-slate-500 text-sm mt-2 block">Cargando usuarios...</span>
                </td>
              </tr>
            ) : error && !hasData ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center">
                  <AlertCircle className="w-6 h-6 text-red-400 mx-auto" />
                  <span className="text-red-500 text-sm mt-2 block">{error}</span>
                  <button
                    onClick={() => void fetchUsers()}
                    className="text-blue-600 hover:text-blue-800 text-sm mt-2"
                  >
                    Reintentar
                  </button>
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm">
                  No se encontraron usuarios
                </td>
              </tr>
            ) : (
              visibleUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 border border-slate-200">
                        {user.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">ID: {user.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-slate-400" />
                      {user.email}
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-1">
                      {user.roles.map((role) => (
                        <UserRoleBadge key={role} role={role} />
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div
                      className={`flex items-center gap-2 text-xs font-medium ${user.status === 'Active' ? 'text-green-700' : 'text-slate-500'}`}
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${user.status === 'Active' ? 'bg-green-500' : 'bg-slate-400'}`}
                      ></div>
                      {getEsActiveInactiveLabel(user.status)}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onOpenEditModal(user)}
                        aria-label={`Editar usuario ${user.name}`}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Editar"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => onRequestPasswordReset(user)}
                        aria-label={`Restablecer contraseña de ${user.name}`}
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                        title="Restablecer Contraseña"
                      >
                        <Key size={16} />
                      </button>
                      <button
                        onClick={() => onRequestDeleteUser(user)}
                        disabled={deleting}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        title="Eliminar"
                        aria-label={`Eliminar usuario ${user.name}`}
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div
        data-testid="users-summary"
        className="px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <span>
            Mostrando {rangeStart}-{rangeEnd} de {totalCount} usuarios
          </span>
          {fetching && hasVisibleData && (
            <span
              className="inline-flex items-center gap-1 text-slate-400"
              aria-label="Actualizando usuarios"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Actualizando...
            </span>
          )}
          {error && hasData && !fetching && (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <AlertCircle className="w-3.5 h-3.5" />
              Error al actualizar ·{' '}
              <button onClick={() => void fetchUsers()} className="underline hover:text-amber-800">
                Reintentar
              </button>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
            disabled={!hasPreviousPage}
            className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Anterior
          </button>
          <button
            onClick={() => setPageIndex((current) => current + 1)}
            disabled={!hasNextPage}
            className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
