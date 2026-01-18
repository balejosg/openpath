import React, { useState, useEffect } from 'react';
import { Monitor, Calendar, Plus, Trash2, Search, Clock, Laptop, RefreshCw } from 'lucide-react';
import { useClassrooms, useClassroomMachines } from '../hooks/useClassrooms';
import { useGroups } from '../hooks/useGroups';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';

const Classrooms = () => {
  const { classrooms, isLoading, error, refetch, deleteClassroom, setActiveGroup, createClassroom, isCreating } = useClassrooms();
  const { groups } = useGroups();
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newClassroom, setNewClassroom] = useState({ name: '', displayName: '', defaultGroupId: '' });
  const [createError, setCreateError] = useState<string | null>(null);

  const selectedClassroom = classrooms.find(c => c.id === selectedClassroomId) || classrooms[0];
  const { data: machines, isLoading: isLoadingMachines } = useClassroomMachines(selectedClassroom?.id);

  useEffect(() => {
    if (!selectedClassroomId && classrooms.length > 0) {
      setSelectedClassroomId(classrooms[0].id);
    }
  }, [classrooms, selectedClassroomId]);

  const filteredClassrooms = classrooms.filter(c => 
    c.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`¿Eliminar aula "${name}"?`)) {
      try {
        await deleteClassroom(id);
        if (selectedClassroomId === id) {
          setSelectedClassroomId(classrooms.find(c => c.id !== id)?.id || null);
        }
      } catch (err: any) {
        alert(`Error: ${err.message}`);
      }
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    try {
        await createClassroom({
            ...newClassroom,
            defaultGroupId: newClassroom.defaultGroupId || undefined
        });
        setIsCreateModalOpen(false);
        setNewClassroom({ name: '', displayName: '', defaultGroupId: '' });
    } catch (err: any) {
        setCreateError(err.message || 'Error al crear el aula');
    }
  };

  const handleSetActiveGroup = async (groupId: string | null) => {
    if (!selectedClassroom) return;
    try {
        await setActiveGroup({ id: selectedClassroom.id, groupId: groupId === 'none' ? null : groupId });
    } catch (err: any) {
        alert(`Error: ${err.message}`);
    }
  };

  if (isLoading) {
    return <div className="p-8 animate-pulse space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded" />
        <div className="flex gap-6 h-[60vh]">
            <div className="w-1/3 bg-white rounded-lg border border-slate-200" />
            <div className="flex-1 bg-white rounded-lg border border-slate-200" />
        </div>
    </div>;
  }

  if (error) {
    return (
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-lg text-center">
            <h3 className="text-lg font-semibold mb-2">Error al cargar aulas</h3>
            <p className="text-sm mb-4">{error.message}</p>
            <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw size={16} className="mr-2" /> Reintentar
            </Button>
        </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6">
      {/* List Column */}
      <div className="w-full md:w-1/3 flex flex-col gap-4">
        <div className="flex justify-between items-center px-1">
            <h2 className="text-lg font-bold text-slate-800">Aulas</h2>
            <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
                <Plus size={16} className="mr-1" /> Nueva
            </Button>
        </div>
        
        <div className="relative">
             <Search size={16} className="absolute left-3 top-3 text-slate-400" />
             <input 
                type="text" 
                placeholder="Buscar aula..." 
                className="w-full bg-white border border-slate-200 rounded-lg py-2.5 pl-9 pr-4 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none shadow-sm transition-all" 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
             />
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          {filteredClassrooms.map(room => (
            <div 
              key={room.id}
              onClick={() => setSelectedClassroomId(room.id)}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                selectedClassroomId === room.id 
                  ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200 shadow-sm' 
                  : 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className={`font-semibold text-sm ${selectedClassroomId === room.id ? 'text-blue-800' : 'text-slate-800'}`}>{room.displayName}</h3>
                {selectedClassroomId === room.id && <div className="w-2 h-2 rounded-full bg-blue-500"></div>}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Laptop size={12} /> {room.machineCount ?? 0} Equipos</span>
                <span className={`px-2 py-0.5 rounded-full border ${room.currentGroupId ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {groups.find(g => g.id === room.currentGroupId)?.name || 'Sin grupo'}
                </span>
              </div>
            </div>
          ))}
          {filteredClassrooms.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">No se encontraron aulas</div>
          )}
        </div>
      </div>

      {/* Detail Column */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
        {selectedClassroom ? (
            <>
                {/* Header of Detail */}
                <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 mb-1">{selectedClassroom.displayName}</h2>
                            <p className="text-slate-500 text-sm font-mono text-xs">ID: {selectedClassroom.name}</p>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => handleDelete(selectedClassroom.id, selectedClassroom.displayName)}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100" 
                                title="Eliminar Aula"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                    
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Cambiar Grupo Activo</label>
                            <select 
                                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-blue-500 outline-none shadow-sm text-sm"
                                value={selectedClassroom.currentGroupId || 'none'}
                                onChange={e => handleSetActiveGroup(e.target.value)}
                            >
                                <option value="none">Sin grupo activo (Acceso denegado)</option>
                                {groups.map(g => (
                                    <option key={g.id} value={g.id}>{g.displayName} ({g.name})</option>
                                ))}
                            </select>
                            <p className="text-[10px] text-slate-400 mt-2">Este cambio afecta a todas las máquinas del aula inmediatamente.</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 flex items-center justify-between">
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Configuración Predeterminada</label>
                                <span className="text-slate-700 font-medium text-sm">
                                    {groups.find(g => g.id === selectedClassroom.defaultGroupId)?.displayName || 'Ninguna'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Schedule & Machines Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Machines Section */}
                    <div className="bg-white border border-slate-200 rounded-lg p-6 flex-1 min-h-[300px] flex flex-col shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
                                <Monitor size={18} className="text-blue-500" />
                                Máquinas Registradas
                            </h3>
                            <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 border border-slate-200 font-medium">
                                Total: {machines?.length || 0}
                            </span>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto max-h-[400px] space-y-2">
                            {isLoadingMachines ? (
                                [1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-50 rounded animate-pulse" />)
                            ) : !machines || machines.length === 0 ? (
                                <div className="border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 h-full">
                                    <Monitor size={48} className="text-slate-300 mb-3" />
                                    <p className="text-slate-900 font-medium text-sm">Sin máquinas activas</p>
                                    <p className="text-slate-500 text-xs mt-1 max-w-xs">Instala el agente de OpenPath en los equipos para verlos aquí.</p>
                                </div>
                            ) : (
                                machines.map((m: any) => (
                                    <div key={m.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded bg-white border ${m.lastSeen ? 'text-green-600 border-green-100' : 'text-slate-300 border-slate-100'}`}>
                                                <Monitor size={14} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-slate-900">{m.hostname}</p>
                                                <p className="text-[10px] text-slate-400 italic">v{m.version || '?'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] text-slate-500">Visto por última vez:</p>
                                            <p className="text-[10px] font-medium text-slate-700">
                                                {m.lastSeen ? new Date(m.lastSeen).toLocaleString() : 'Nunca'}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Schedule Section */}
                    <div className="bg-white border border-slate-200 rounded-lg p-6 flex-1 min-h-[300px] flex flex-col shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
                                <Clock size={18} className="text-slate-500" />
                                Horario del Aula
                            </h3>
                        </div>
                        
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
                            <Calendar size={48} className="text-slate-300 mb-3" />
                            <p className="text-sm">Vista de horarios disponible próximamente.</p>
                            <Button variant="outline" className="mt-4" size="sm">
                                <Calendar size={14} className="mr-2" /> Gestionar Horarios
                            </Button>
                        </div>
                    </div>
                </div>
            </>
        ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-white border border-slate-200 rounded-lg shadow-sm">
                <Laptop size={64} className="text-slate-200 mb-4" />
                <h3 className="text-lg font-medium text-slate-900">Selecciona un aula</h3>
                <p className="text-slate-500 text-sm mt-1">Elige un aula del panel izquierdo para ver sus detalles.</p>
            </div>
        )}
      </div>

      {/* Create Classroom Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Nueva Aula"
      >
        <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Nombre de Identificación (ID)</label>
                <Input 
                    placeholder="ej: aula-informatica-1"
                    value={newClassroom.name}
                    onChange={e => setNewClassroom({ ...newClassroom, name: e.target.value })}
                    required
                />
                <p className="text-[10px] text-slate-500">Este ID se usa para vincular equipos al aula.</p>
            </div>
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Nombre Visible</label>
                <Input 
                    placeholder="ej: Aula de Informática 1"
                    value={newClassroom.displayName}
                    onChange={e => setNewClassroom({ ...newClassroom, displayName: e.target.value })}
                    required
                />
            </div>
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Grupo Predeterminado</label>
                <select 
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-blue-500 outline-none shadow-sm text-sm"
                    value={newClassroom.defaultGroupId}
                    onChange={e => setNewClassroom({ ...newClassroom, defaultGroupId: e.target.value })}
                >
                    <option value="">Sin grupo predeterminado</option>
                    {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.displayName}</option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-400">Grupo que se aplicará automáticamente al iniciar sesión.</p>
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
                    Crear Aula
                </Button>
            </div>
        </form>
      </Modal>
    </div>
  );
};


export default Classrooms;