import React, { useState } from 'react';
import { MoreHorizontal, ShieldCheck, Folder, ArrowRight, RefreshCw, Trash2, Edit2 } from 'lucide-react';
import { useGroups } from '../hooks/useGroups';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import GroupRules from './GroupRules';

const Groups = () => {
    const { groups, isLoading, error, refetch, createGroup, isCreating, deleteGroup } = useGroups();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newGroup, setNewGroup] = useState({ name: '', displayName: '' });
    const [createError, setCreateError] = useState<string | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<{ id: string; name: string } | null>(null);

    const handleCreateGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateError(null);
        try {
            await createGroup(newGroup);
            setIsCreateModalOpen(false);
            setNewGroup({ name: '', displayName: '' });
        } catch (err: any) {
            setCreateError(err.message || 'Error al crear el grupo');
        }
    };

    const handleDeleteGroup = async (id: string, name: string) => {
        if (window.confirm(`¿Estás seguro de que deseas eliminar el grupo "${name}"? Esta acción no se puede deshacer.`)) {
            try {
                await deleteGroup(id);
            } catch (err: any) {
                alert(`Error al eliminar el grupo: ${err.message}`);
            }
        }
    };

    if (selectedGroup) {
        return (
            <GroupRules 
                groupId={selectedGroup.id} 
                groupName={selectedGroup.name} 
                onBack={() => {
                    setSelectedGroup(null);
                    refetch();
                }} 
            />
        );
    }

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
                    <div className="h-10 w-32 bg-slate-200 rounded animate-pulse" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-48 bg-white border border-slate-200 rounded-lg animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-lg text-center">
                <h3 className="text-lg font-semibold mb-2">Error al cargar grupos</h3>
                <p className="text-sm mb-4">{error.message}</p>
                <Button 
                    variant="outline"
                    onClick={() => refetch()}
                    className="inline-flex items-center gap-2"
                >
                    <RefreshCw size={16} /> Reintentar
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Grupos de Seguridad</h2>
                    <p className="text-slate-500 text-sm">Gestiona políticas de acceso y restricciones.</p>
                </div>
                <Button onClick={() => setIsCreateModalOpen(true)}>
                    + Nuevo Grupo
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups.map((group) => (
                    <div key={group.id} className="bg-white border border-slate-200 rounded-lg p-5 hover:border-blue-300 transition-all group relative shadow-sm hover:shadow-md">
                        <div className="absolute top-4 right-4 group-hover:opacity-100 opacity-0 transition-opacity flex gap-1">
                             <button 
                                onClick={() => handleDeleteGroup(group.id, group.displayName)}
                                className="text-slate-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"
                                title="Eliminar grupo"
                             >
                                <Trash2 size={16} />
                             </button>
                        </div>
                        
                        <div className="flex items-start gap-4 mb-4">
                            <div className={`p-3 rounded-lg ${group.enabled ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                <Folder size={20} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 text-sm">{group.name}</h3>
                                <p className="text-xs text-slate-500 mt-1 line-clamp-1">{group.displayName}</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm py-2 border-t border-slate-100 border-b">
                                <span className="text-slate-500 flex items-center gap-2 text-xs"><ShieldCheck size={14} /> Dominios</span>
                                <span className="font-medium text-slate-900">{group.whitelistCount}</span>
                            </div>
                            
                            <div className="flex justify-between items-center pt-1">
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${group.enabled ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                                    {group.enabled ? 'Activo' : 'Inactivo'}
                                </span>
                                <button 
                                    onClick={() => setSelectedGroup({ id: group.id, name: group.displayName })}
                                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium transition-opacity"
                                >
                                    Configurar <ArrowRight size={12} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            
            {groups.length === 0 && (
                <div className="text-center py-12 bg-white border border-slate-200 rounded-lg">
                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Folder className="text-slate-300" size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900">No hay grupos</h3>
                    <p className="text-slate-500 text-sm mt-1">Crea un grupo para empezar a gestionar el acceso.</p>
                </div>
            )}

            {/* Create Group Modal */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title="Nuevo Grupo de Seguridad"
            >
                <form onSubmit={handleCreateGroup} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Nombre (ID único)</label>
                        <Input 
                            placeholder="ej: alumnos-primaria"
                            value={newGroup.name}
                            onChange={e => setNewGroup({ ...newGroup, name: e.target.value })}
                            required
                        />
                        <p className="text-[10px] text-slate-500">Se usará para la URL de exportación: /export/nombre.txt</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Nombre Visible</label>
                        <Input 
                            placeholder="ej: Alumnos de Primaria"
                            value={newGroup.displayName}
                            onChange={e => setNewGroup({ ...newGroup, displayName: e.target.value })}
                            required
                        />
                    </div>

                    {createError && (
                        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                            {createError}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <Button 
                            type="button" 
                            variant="ghost" 
                            onClick={() => setIsCreateModalOpen(false)}
                        >
                            Cancelar
                        </Button>
                        <Button 
                            type="submit" 
                            isLoading={isCreating}
                        >
                            Crear Grupo
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};


export default Groups;
