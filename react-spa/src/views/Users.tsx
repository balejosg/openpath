import React, { useState, useMemo } from 'react';
import { Search, Filter, Mail, Edit2, Trash, Key, Loader2, AlertCircle } from 'lucide-react';
import { User, UserRole } from '../types';
import type { CreateUserRole } from '../lib/roles';
import { DEFAULT_CREATE_USER_ROLE, USER_ROLE_LABELS } from '../lib/roles';
import { useUsersList } from '../hooks/useUsersList';
import { useUsersActions } from '../hooks/useUsersActions';
import { downloadFile } from '../lib/exportRules';
import { toCsv } from '../lib/csv';
import { DangerConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';

const RoleBadge: React.FC<{ role: UserRole }> = ({ role }) => {
  const styles = {
    [UserRole.ADMIN]: 'bg-purple-50 text-purple-700 border-purple-200',
    [UserRole.TEACHER]: 'bg-blue-50 text-blue-700 border-blue-200',
    [UserRole.STUDENT]: 'bg-slate-100 text-slate-600 border-slate-200',
    [UserRole.NO_ROLES]: 'bg-red-50 text-red-600 border-red-200',
  };
  const roleStyle = styles[role];
  return (
    <span
      className={`px-2 py-0.5 rounded text-[11px] font-semibold border uppercase tracking-wide ${roleStyle}`}
    >
      {USER_ROLE_LABELS[role]}
    </span>
  );
};

const UsersView = () => {
  const { users, loading, fetching, error, fetchUsers } = useUsersList();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRoles, setEditRoles] = useState<UserRole[]>([]);

  // New user form state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<CreateUserRole>(DEFAULT_CREATE_USER_ROLE);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const {
    saving,
    deleting,
    createError,
    setCreateError,
    deleteError,
    deleteTarget,
    handleSaveEdit,
    handleCreateUser,
    requestDeleteUser,
    clearDeleteState,
    handleConfirmDeleteUser,
  } = useUsersActions();

  // Filter users based on search
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(
      (user) => user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRoles([...user.roles]);
    setShowEditModal(true);
  };

  const handleSaveEditSubmit = async () => {
    if (!selectedUser) return;

    const ok = await handleSaveEdit({
      id: selectedUser.id,
      name: editName,
      email: editEmail,
    });

    if (ok) {
      setShowEditModal(false);
    }
  };

  const closeEditModal = () => {
    if (saving) return;
    setShowEditModal(false);
  };

  const closeNewModal = () => {
    if (saving) return;
    setShowNewModal(false);
  };

  const handleCreateUserSubmit = async () => {
    const result = await handleCreateUser({
      name: newName,
      email: newEmail,
      password: newPassword,
      role: newRole,
    });

    if (!result.ok) return;

    setNewName('');
    setNewEmail('');
    setNewPassword('');
    setNewRole(DEFAULT_CREATE_USER_ROLE);
    setShowNewModal(false);
  };

  const toggleRole = (role: UserRole) => {
    if (editRoles.includes(role)) {
      setEditRoles(editRoles.filter((r) => r !== role));
    } else {
      setEditRoles([...editRoles, role]);
    }
  };

  const handleExportUsers = () => {
    if (filteredUsers.length === 0) {
      setExportMessage('No hay usuarios para exportar');
      return;
    }

    const headers = ['Nombre', 'Email', 'Roles', 'Estado'];
    const rows = filteredUsers.map((user) => [
      user.name,
      user.email,
      user.roles.join('|'),
      user.status,
    ]);

    const csvContent = toCsv([headers, ...rows]);

    downloadFile(csvContent, 'usuarios.csv', 'text/csv;charset=utf-8');

    setExportMessage('Exportación iniciada');
  };

  const visibleCount = filteredUsers.length;
  const totalCount = users.length;
  const rangeStart = visibleCount === 0 ? 0 : 1;
  const rangeEnd = visibleCount === 0 ? 0 : visibleCount;
  const showInitialLoading = loading && users.length === 0;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Gestión de Usuarios</h2>
          <p className="text-slate-500 text-sm">Administra los accesos y roles de la plataforma.</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          + Nuevo Usuario
        </button>
      </div>

      {/* Filters & Search */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row gap-4 justify-between items-center shadow-sm">
        <div className="relative w-full md:w-96">
          <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 pl-10 pr-4 text-sm text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button
            disabled
            title="Filtros próximamente"
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-500 opacity-60 cursor-not-allowed"
          >
            <Filter size={16} /> Filtros
          </button>
          <button
            onClick={handleExportUsers}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Exportar
          </button>
        </div>
      </div>

      {exportMessage && (
        <p className="text-sm text-slate-600" role="status">
          {exportMessage}
        </p>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
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
              {error ? (
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
              ) : showInitialLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
                    <span className="text-slate-500 text-sm mt-2 block">Cargando usuarios...</span>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm">
                    No se encontraron usuarios
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
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
                          <RoleBadge key={role} role={role} />
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
                        {user.status === 'Active' ? 'Activo' : 'Inactivo'}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEdit(user)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                          title="Restablecer Contraseña"
                        >
                          <Key size={16} />
                        </button>
                        <button
                          onClick={() => requestDeleteUser(user)}
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

        {/* Pagination Mock */}
        <div
          data-testid="users-summary"
          className="px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 bg-slate-50"
        >
          <div className="flex items-center gap-2">
            <span>
              Mostrando {rangeStart}-{rangeEnd} de {totalCount} usuarios
            </span>
            {fetching && users.length > 0 && (
              <span
                className="inline-flex items-center gap-1 text-slate-400"
                aria-label="Actualizando usuarios"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Actualizando...
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              disabled={visibleCount === 0}
              className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <button
              disabled={visibleCount === 0}
              className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Editar Usuario */}
      {showEditModal && selectedUser && (
        <Modal isOpen onClose={closeEditModal} title="Editar Usuario" className="max-w-md">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Roles</label>
              <div className="flex flex-wrap gap-2">
                {[UserRole.ADMIN, UserRole.TEACHER].map((role) => (
                  <label
                    key={role}
                    className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg text-sm cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={editRoles.includes(role)}
                      onChange={() => toggleRole(role)}
                      className="rounded"
                    />
                    {role === UserRole.ADMIN ? 'Administrador' : 'Profesor'}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={closeEditModal}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleSaveEditSubmit()}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                Guardar Cambios
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Nuevo Usuario */}
      {showNewModal && (
        <Modal isOpen onClose={closeNewModal} title="Nuevo Usuario" className="max-w-md">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
              <input
                type="text"
                placeholder="Nombre completo"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (createError) setCreateError('');
                }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                placeholder="usuario@dominio.com"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  if (createError) setCreateError('');
                }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
              <input
                type="password"
                placeholder="Mínimo 8 caracteres"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (createError) setCreateError('');
                }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
              <select
                value={newRole}
                onChange={(e) => {
                  setNewRole(e.target.value as CreateUserRole);
                  if (createError) setCreateError('');
                }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="teacher">Profesor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            {createError && (
              <p className="text-red-500 text-xs flex items-center gap-1">
                <AlertCircle size={12} /> {createError}
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  closeNewModal();
                  setNewName('');
                  setNewEmail('');
                  setNewPassword('');
                  setNewRole(DEFAULT_CREATE_USER_ROLE);
                  setCreateError('');
                }}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleCreateUserSubmit()}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                Crear Usuario
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Confirmar Eliminacion */}
      {deleteTarget && (
        <DangerConfirmDialog
          isOpen
          title="Eliminar Usuario"
          confirmLabel="Eliminar usuario"
          cancelLabel="Cancelar"
          isLoading={deleting}
          errorMessage={deleteError}
          onClose={clearDeleteState}
          onConfirm={() => void handleConfirmDeleteUser()}
        >
          <p className="text-sm text-slate-600">
            ¿Estás seguro de que quieres eliminar a{' '}
            <span className="font-semibold text-slate-800">{deleteTarget.name}</span>?
          </p>
          <p className="text-xs text-slate-500">Esta acción no se puede deshacer.</p>
        </DangerConfirmDialog>
      )}
    </div>
  );
};

export default UsersView;
