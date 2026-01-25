import React from 'react';
import { Search, Filter, Mail, Edit2, Trash, Key } from 'lucide-react';
import { User, UserRole } from '../types';

const mockUsers: User[] = [
  { id: '1', name: 'Bruno Alejos Gomez', email: 'bruno.ag@educa.madrid.org', roles: [UserRole.ADMIN], status: 'Active' },
  { id: '2', name: 'IT QA 20260111', email: 'it.qa+20260111@pruebas.local', roles: [UserRole.ADMIN], status: 'Active' },
  { id: '3', name: 'Test User', email: 'test.user@pruebas.local', roles: [UserRole.OPENPATH_ADMIN], status: 'Inactive' },
  { id: '4', name: 'Sisyphus Test Admin', email: 'sisyphus.test@test.local', roles: [UserRole.ADMIN], status: 'Active' },
  { id: '5', name: 'Regular Teacher', email: 'teacher@school.edu', roles: [UserRole.USER], status: 'Active' },
  { id: '6', name: 'Lab Assistant', email: 'assistant@school.edu', roles: [UserRole.NO_ROLES], status: 'Active' },
];

const RoleBadge: React.FC<{ role: UserRole }> = ({ role }) => {
    const styles = {
        [UserRole.ADMIN]: 'bg-purple-50 text-purple-700 border-purple-200',
        [UserRole.OPENPATH_ADMIN]: 'bg-blue-50 text-blue-700 border-blue-200',
        [UserRole.USER]: 'bg-slate-100 text-slate-600 border-slate-200',
        [UserRole.NO_ROLES]: 'bg-red-50 text-red-600 border-red-200',
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border uppercase tracking-wide ${styles[role] || styles[UserRole.USER]}`}>
            {role}
        </span>
    );
};

const UsersView = () => {
  return (
    <div className="space-y-6">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                 <h2 className="text-xl font-bold text-slate-900">Gestión de Usuarios</h2>
                 <p className="text-slate-500 text-sm">Administra los accesos y roles de la plataforma.</p>
            </div>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2 pl-10 pr-4 text-sm text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all"
                />
            </div>
            <div className="flex gap-2 w-full md:w-auto">
                <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                    <Filter size={16} /> Filtros
                </button>
                <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                    Exportar
                </button>
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
                        {mockUsers.map((user) => (
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
                                    <div className="flex gap-1">
                                        {user.roles.map(role => <RoleBadge key={role} role={role} />)}
                                    </div>
                                </td>
                                <td className="px-6 py-3">
                                    <div className={`flex items-center gap-2 text-xs font-medium ${user.status === 'Active' ? 'text-green-700' : 'text-slate-500'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${user.status === 'Active' ? 'bg-green-500' : 'bg-slate-400'}`}></div>
                                        {user.status === 'Active' ? 'Activo' : 'Inactivo'}
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
                                        <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Desactivar">
                                            <Trash size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* Pagination Mock */}
            <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 bg-slate-50">
                <span>Mostrando 1-6 de 24 usuarios</span>
                <div className="flex gap-2">
                    <button className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors shadow-sm">Anterior</button>
                    <button className="px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors shadow-sm">Siguiente</button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default UsersView;