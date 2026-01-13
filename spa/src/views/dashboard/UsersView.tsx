import { useState, useEffect, useCallback } from 'react';
import { trpc } from '../../lib/trpc';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { User, RoleInfo, Group } from '../../types';
import { useAppStore } from '../../stores/appStore';

type UserRoleType = 'admin' | 'teacher' | 'student';

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateUserModal({ open, onClose, onSuccess }: CreateUserModalProps) {
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await trpc.users.create.mutate(formData);
      setFormData({ name: '', email: '', password: '' });
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error creating user:', err);
      alert('Error al crear usuario: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Crear Usuario">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nombre"
          type="text"
          value={formData.name}
          onChange={(e) => { setFormData({ ...formData, name: e.target.value }); }}
          required
          placeholder="Juan Pérez"
        />
        <Input
          label="Email"
          type="email"
          value={formData.email}
          onChange={(e) => { setFormData({ ...formData, email: e.target.value }); }}
          required
          placeholder="juan@example.com"
        />
        <Input
          label="Contraseña"
          type="password"
          value={formData.password}
          onChange={(e) => { setFormData({ ...formData, password: e.target.value }); }}
          required
          minLength={8}
          placeholder="Mínimo 8 caracteres"
        />
        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creando...' : 'Crear Usuario'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface EditUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
}

function EditUserModal({ open, onClose, onSuccess, userId }: EditUserModalProps) {
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open && userId) {
      setIsLoading(true);
      trpc.users.get.query({ id: userId })
        .then((user: User) => {
          setFormData({ name: user.name, email: user.email, password: '' });
        })
        .catch((err: unknown) => {
          console.error('Error loading user:', err);
          alert('Error al cargar usuario');
          onClose();
        })
        .finally(() => { setIsLoading(false); });
    }
  }, [open, userId, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const updates: { name: string; email: string; password?: string } = {
        name: formData.name,
        email: formData.email,
      };
      if (formData.password) {
        updates.password = formData.password;
      }
      await trpc.users.update.mutate({ id: userId, ...updates });
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error updating user:', err);
      alert('Error al actualizar usuario: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Editar Usuario">
      {isLoading ? (
        <div className="py-8 text-center text-gray-500">Cargando...</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nombre"
            type="text"
            value={formData.name}
            onChange={(e) => { setFormData({ ...formData, name: e.target.value }); }}
            required
            placeholder="Juan Pérez"
          />
          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => { setFormData({ ...formData, email: e.target.value }); }}
            required
            placeholder="juan@example.com"
          />
          <Input
            label="Nueva Contraseña"
            type="password"
            value={formData.password}
            onChange={(e) => { setFormData({ ...formData, password: e.target.value }); }}
            minLength={8}
            placeholder="Dejar vacío para no cambiar"
          />
          <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

interface AssignRoleModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  userName: string;
}

function AssignRoleModal({ open, onClose, onSuccess, userId, userName }: AssignRoleModalProps) {
  const [role, setRole] = useState<UserRoleType>('teacher');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const groups = useAppStore((state) => state.allGroups);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await trpc.users.assignRole.mutate({
        userId,
        role,
        groupIds: role === 'teacher' ? selectedGroups : [],
      });
      setRole('teacher');
      setSelectedGroups([]);
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error assigning role:', err);
      alert('Error al asignar rol: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGroupToggle = (groupName: string) => {
    setSelectedGroups((prev) =>
      prev.includes(groupName) ? prev.filter((g) => g !== groupName) : [...prev, groupName]
    );
  };

  return (
    <Modal open={open} onClose={onClose} title={`Asignar Rol - ${userName}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
          <select
            value={role}
            onChange={(e) => { setRole(e.target.value as UserRoleType); }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="admin">Administrador</option>
            <option value="teacher">Profesor</option>
            <option value="student">Estudiante</option>
          </select>
        </div>

        {role === 'teacher' && groups.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Grupos (múltiple selección)
            </label>
            <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
              {groups.map((group: Group) => (
                <label key={group.name} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(group.name)}
                    onChange={() => { handleGroupToggle(group.name); }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{group.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Asignando...' : 'Asignar Rol'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function UsersView() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [assignRoleModalOpen, setAssignRoleModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedUserName, setSelectedUserName] = useState('');

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await trpc.users.list.query() as User[];
      setUsers(result);
    } catch (err) {
      console.error('Error loading users:', err);
      alert('Error al cargar usuarios');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`¿Eliminar usuario "${userName}"? Esta acción no se puede deshacer.`)) return;
    try {
      await trpc.users.delete.mutate({ id: userId });
      await loadUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Error al eliminar usuario: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleRevokeRole = async (userId: string, roleId: string) => {
    if (!confirm('¿Revocar este rol?')) return;
    try {
      await trpc.users.revokeRole.mutate({ userId, roleId });
      await loadUsers();
    } catch (err) {
      console.error('Error revoking role:', err);
      alert('Error al revocar rol: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleGenerateResetToken = async (email: string) => {
    if (!confirm(`¿Generar token de recuperación para ${email}?`)) return;
    try {
      const result = await trpc.auth.generateResetToken.mutate({ email }) as { token: string };
      prompt('Token generado. Copia y envía al usuario:', result.token);
    } catch (err) {
      console.error('Error generating token:', err);
      alert('Error al generar token: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const openEditModal = (userId: string) => {
    setSelectedUserId(userId);
    setEditModalOpen(true);
  };

  const openAssignRoleModal = (userId: string, userName: string) => {
    setSelectedUserId(userId);
    setSelectedUserName(userName);
    setAssignRoleModalOpen(true);
  };

  const getRoleBadgeVariant = (role: string): 'default' | 'success' | 'warning' | 'danger' => {
    if (role === 'admin') return 'danger';
    if (role === 'teacher') return 'success';
    return 'default';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Usuarios y Roles</h2>
              <p className="mt-1 text-sm text-slate-600">Gestión de usuarios, permisos y asignación de roles</p>
            </div>
            <Button onClick={() => { setCreateModalOpen(true); }}>Crear Usuario</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center text-gray-500">Cargando usuarios...</div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No hay usuarios registrados</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Usuario</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Email</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Roles</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900">{user.name}</div>
                        <div className="text-xs text-gray-500">ID: {user.id.substring(0, 8)}...</div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700">{user.email}</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1 items-center">
                          {user.roles.length === 0 ? (
                            <span className="text-xs text-gray-500">Sin roles</span>
                          ) : (
                            user.roles.map((roleInfo: RoleInfo) => (
                              <div key={`${user.id}-${roleInfo.role}`} className="inline-flex items-center gap-1">
                                <Badge variant={getRoleBadgeVariant(roleInfo.role)}>
                                  {roleInfo.role}
                                  {roleInfo.groupIds.length > 0 && ` (${roleInfo.groupIds.length})`}
                                </Badge>
                                <button
                                  onClick={() => void handleRevokeRole(user.id, roleInfo.role)}
                                  className="text-red-600 hover:text-red-800 text-xs font-bold"
                                  title="Revocar rol"
                                >
                                  ×
                                </button>
                              </div>
                            ))
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => { openAssignRoleModal(user.id, user.name); }}
                            title="Asignar rol"
                          >
                            +
                          </Button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleGenerateResetToken(user.email)}
                            title="Generar token de recuperación"
                          >
                            🔑
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => { openEditModal(user.id); }}
                            title="Editar usuario"
                          >
                            ✏️
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => void handleDeleteUser(user.id, user.name)}
                            title="Eliminar usuario"
                          >
                            🗑️
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateUserModal
        open={createModalOpen}
        onClose={() => { setCreateModalOpen(false); }}
        onSuccess={() => void loadUsers()}
      />

      <EditUserModal
        open={editModalOpen}
        onClose={() => { setEditModalOpen(false); }}
        onSuccess={() => void loadUsers()}
        userId={selectedUserId}
      />

      <AssignRoleModal
        open={assignRoleModalOpen}
        onClose={() => { setAssignRoleModalOpen(false); }}
        onSuccess={() => void loadUsers()}
        userId={selectedUserId}
        userName={selectedUserName}
      />
    </div>
  );
}
