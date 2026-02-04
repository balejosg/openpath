import React, { useState, useMemo } from 'react';
import {
  Monitor,
  Calendar,
  Plus,
  Trash2,
  Search,
  Clock,
  Laptop,
  X,
  AlertCircle,
} from 'lucide-react';
import { Classroom } from '../types';

const initialClassrooms: Classroom[] = [
  { id: '1', name: 'Aula QA 1', computerCount: 24, activeGroup: 'grupo-qa-1' },
  { id: '2', name: 'Laboratorio B', computerCount: 15, activeGroup: 'test-group-final' },
  { id: '3', name: 'Aula Informática 3', computerCount: 30, activeGroup: null },
];

const Classrooms = () => {
  const [classrooms, setClassrooms] = useState<Classroom[]>(initialClassrooms);
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(
    initialClassrooms[0] ?? null
  );
  const [showNewModal, setShowNewModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // New classroom form state
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [newError, setNewError] = useState('');

  // Filter classrooms based on search
  const filteredClassrooms = useMemo(() => {
    if (!searchQuery.trim()) return classrooms;
    const query = searchQuery.toLowerCase();
    return classrooms.filter(
      (room) =>
        room.name.toLowerCase().includes(query) ||
        (room.activeGroup?.toLowerCase().includes(query) ?? false)
    );
  }, [classrooms, searchQuery]);

  const handleCreateClassroom = () => {
    if (!newName.trim()) {
      setNewError('El nombre del aula es obligatorio');
      return;
    }

    const newClassroom: Classroom = {
      id: String(Date.now()),
      name: newName.trim(),
      computerCount: 0,
      activeGroup: newGroup || null,
    };

    setClassrooms([...classrooms, newClassroom]);
    setSelectedClassroom(newClassroom);
    setNewName('');
    setNewGroup('');
    setNewError('');
    setShowNewModal(false);
  };

  const handleDeleteClassroom = () => {
    if (!selectedClassroom) return;

    const updated = classrooms.filter((c) => c.id !== selectedClassroom.id);
    setClassrooms(updated);
    setSelectedClassroom(updated[0] ?? null);
    setShowDeleteConfirm(false);
  };

  const openNewModal = () => {
    setNewName('');
    setNewGroup('');
    setNewError('');
    setShowNewModal(true);
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6">
      {/* List Column */}
      <div className="w-full md:w-1/3 flex flex-col gap-4">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-lg font-bold text-slate-800">Aulas</h2>
          <button
            onClick={openNewModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors shadow-sm font-medium"
          >
            <Plus size={16} /> Nueva
          </button>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar aula..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg py-2.5 pl-9 pr-4 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none shadow-sm transition-all"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          {filteredClassrooms.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">No se encontraron aulas</div>
          ) : (
            filteredClassrooms.map((room) => (
              <div
                key={room.id}
                onClick={() => setSelectedClassroom(room)}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  selectedClassroom?.id === room.id
                    ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3
                    className={`font-semibold text-sm ${selectedClassroom?.id === room.id ? 'text-blue-800' : 'text-slate-800'}`}
                  >
                    {room.name}
                  </h3>
                  {selectedClassroom?.id === room.id && (
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Laptop size={12} /> {room.computerCount} Equipos
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full border ${room.activeGroup ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}
                  >
                    {room.activeGroup ?? 'Sin grupo'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detail Column */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
        {!selectedClassroom ? (
          <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Sin aulas</h2>
            <p className="text-slate-500 text-sm">
              Crea una nueva aula para ver su configuracion y estado.
            </p>
            <button
              onClick={openNewModal}
              className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm inline-flex items-center gap-2 transition-colors shadow-sm font-medium"
            >
              <Plus size={16} /> Crear aula
            </button>
          </div>
        ) : (
          <>
            {/* Header of Detail */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-1">
                    {selectedClassroom.name}
                  </h2>
                  <p className="text-slate-500 text-sm">Configuración y estado del aula</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                    title="Eliminar Aula"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                    Grupo Activo
                  </label>
                  <select className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-blue-500 outline-none shadow-sm">
                    <option value="grupo-qa-1">grupo-qa-1</option>
                    <option value="test-group">test-group-verification</option>
                    <option value="none">Sin grupo activo</option>
                  </select>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                      Estado
                    </label>
                    <span className="text-green-700 font-medium flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div> Operativo
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
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Monitor size={18} className="text-blue-500" />
                    Máquinas Registradas
                  </h3>
                  <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 border border-slate-200 font-medium">
                    Total: {selectedClassroom.computerCount}
                  </span>
                </div>

                {/* Empty State Style */}
                <div className="flex-1 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
                  <Monitor size={48} className="text-slate-300 mb-3" />
                  <p className="text-slate-900 font-medium text-sm">Sin máquinas activas</p>
                  <p className="text-slate-500 text-xs mt-1 max-w-xs">
                    Instala el agente de OpenPath en los equipos para verlos aquí.
                  </p>
                </div>
              </div>

              {/* Schedule Section */}
              <div className="bg-white border border-slate-200 rounded-lg p-6 flex-1 min-h-[300px] flex flex-col shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Clock size={18} className="text-slate-500" />
                    Horario del Aula
                  </h3>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
                  <Calendar size={48} className="text-slate-300 mb-3" />
                  <p className="text-sm">Sin horarios configurados.</p>
                  <button
                    onClick={() => setShowScheduleModal(true)}
                    className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline"
                  >
                    Configurar Horario
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal: Nueva Aula */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Nueva Aula</h3>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre del Aula
                </label>
                <input
                  type="text"
                  placeholder="Ej: Laboratorio C"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    if (newError) setNewError('');
                  }}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${newError ? 'border-red-300' : 'border-slate-300'}`}
                />
                {newError && (
                  <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> {newError}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Grupo Inicial
                </label>
                <select
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">Sin grupo</option>
                  <option value="grupo-qa-1">grupo-qa-1</option>
                  <option value="test-group">test-group-verification</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateClassroom}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Crear Aula
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Configurar Horario */}
      {showScheduleModal && selectedClassroom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">
                Configurar Horario - {selectedClassroom.name}
              </h3>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Configura los bloques horarios en los que esta aula estará activa.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Hora Inicio
                  </label>
                  <input
                    type="time"
                    defaultValue="08:00"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Hora Fin</label>
                  <input
                    type="time"
                    defaultValue="14:00"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Días Activos
                </label>
                <div className="flex gap-2">
                  {['L', 'M', 'X', 'J', 'V'].map((day) => (
                    <button
                      key={day}
                      className="w-10 h-10 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 transition-colors"
                    >
                      {day}
                    </button>
                  ))}
                  {['S', 'D'].map((day) => (
                    <button
                      key={day}
                      className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 font-medium hover:bg-slate-100 transition-colors"
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Guardar Horario
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminación */}
      {showDeleteConfirm && selectedClassroom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="text-red-600" size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Eliminar Aula</h3>
              <p className="text-sm text-slate-600 mb-6">
                ¿Estás seguro de que quieres eliminar <strong>{selectedClassroom.name}</strong>?
                Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteClassroom}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Classrooms;
