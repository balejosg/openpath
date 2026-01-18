import React, { useState } from 'react';
import { Search, Filter, Mail, Edit2, Trash, Key, RefreshCw, Shield } from 'lucide-react';
import { UserRole } from '../types';
import { useUsers } from '../hooks/useUsers';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';

const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
    const styles: Record<string, string> = {
        'admin': 'bg-purple-50 text-purple-700 border-purple-200',
        'openpath-admin': 'bg-blue-50 text-blue-700 border-blue-200',
        'teacher': 'bg-emerald-50 text-emerald-700 border-emerald-200',
        'student': 'bg-amber-50 text-amber-700 border-amber-200',
        'user': 'bg-slate-100 text-slate-600 border-slate-200',
        'no roles': 'bg-red-50 text-red-600 border-red-200',
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wide ${styles[role] || styles.user}`}>
            {role}
        </span>
    );
};

const UsersView = () => {
  const { users, isLoading, error, refetch, deleteUser, createUser, isCreating } = useUsers();
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });
  const [createError, setCreateError] = useState<string | null>(null);

  const filteredUsers = (users as any[]).filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar al usuario "${name}"?`)) {
        try {
            await deleteUser(id);
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    try {
        await createUser({ ...newUser, role: 'teacher' });
        setIsCreateModalOpen(false);
        setNewUser({ name: '', email: '', password: '' });
    } catch (err: any) {
        setCreateError(err.message || 'Error al crear usuario');
    }
  };

  if (isLoading) {
    return (
        <div className="space-y-6">
            <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
            <div className="bg-white border border-slate-200 rounded-lg p-4 h-16 animate-pulse" />
            <div className="bg-white border border-slate-200 rounded-lg h-96 animate-pulse" />
        </div>
    );
  }

  if (error) {
    return (
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-lg text-center">
            <h3 className="text-lg font-semibold mb-2">Error al cargar usuarios</h3>
            <p className="text-sm mb-4">{error.message}</p>
            <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw size={16} className="mr-2" /> Reintentar
            </Button>
        </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                 <h2 className="text-xl font-bold text-slate-900">Gestión de Usuarios</h2>
                 <p className="text-slate-500 text-sm">Administra los accesos y roles de la plataforma.</p>
            </div>
            <Button onClick={() => setIsCreateModalOpen(true)}>
                + Nuevo Usuario
            </Button>
        </div>

        {/* Filters & Search */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row gap-4 justify-between items-center shadow-sm">
            <div className="relative w-full md:w-96">
                <Search size={18} className="absolute left-3 top-2.5 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Buscar por nombre o email..." 
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 pl-10 pr-4 text-sm text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="flex gap-2 w-full md:w-auto">
                <Button variant="outline" size="sm">
                    <Filter size={16} className="mr-2" /> Filtros
                </Button>
                <Button variant="outline" size="sm">
                    Exportar
                </Button>
            </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
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
                        {filteredUsers.map((user) => (
                            <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                                <td className="px-6 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 border border-slate-200">
                                            {user.name.substring(0,2).toUpperCase()}
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
                                    <div className="flex gap-1 flex-wrap">
                                        {user.roles && user.roles.length > 0 ? (
                                            user.roles.map((r: any) => <RoleBadge key={r.id} role={r.role} />)
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">Sin roles</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-3">
                                    <div className={`flex items-center gap-2 text-xs font-medium ${user.isActive ? 'text-green-700' : 'text-slate-500'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-slate-400'}`}></div>
                                        {user.isActive ? 'Activo' : 'Inactivo'}
                                    </div>
                                </td>
                                <td className="px-6 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Editar">
                                            <Edit2 size={16} />
                                        </button>
                                        <button className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="Restablecer Contraseña">
                                            <Key size={16} />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(user.id, user.name)}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" 
                                            title="Eliminar"
                                        >
                                            <Trash size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 bg-slate-50">
                <span>Total: {filteredUsers.length} usuarios</span>
            </div>
        </div>

        {/* Create User Modal */}
        <Modal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            title="Nuevo Usuario"
        >
            <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Nombre Completo</label>
                    <Input 
                        placeholder="ej: Juan Pérez"
                        value={newUser.name}
                        onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                        required
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Email</label>
                    <Input 
                        type="email"
                        placeholder="ej: juan@colegio.edu"
                        value={newUser.email}
                        onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                        required
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Contraseña Provisional</label>
                    <Input 
                        type="password"
                        placeholder="Mínimo 8 caracteres"
                        value={newUser.password}
                        onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                        required
                        minLength={8}
                    />
                </div>

                {createError && (
                    <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                        {createError}
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)}>
                        Cancelar
                    </Button>
                    <Button type="submit" isLoading={isCreating}>
                        Crear Usuario
                    </Button>
                </div>
            </form>
        </Modal>
    </div>
  );
};


export default UsersView;