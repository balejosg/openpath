import React, { useState } from 'react';
import { Monitor, Calendar, Plus, Trash2, Search, Clock, Laptop } from 'lucide-react';
import { Classroom } from '../types';

const mockClassrooms: Classroom[] = [
  { id: '1', name: 'Aula QA 1', computerCount: 24, activeGroup: 'grupo-qa-1' },
  { id: '2', name: 'Laboratorio B', computerCount: 15, activeGroup: 'test-group-final' },
  { id: '3', name: 'Aula Informática 3', computerCount: 30, activeGroup: 'None' },
];

const Classrooms = () => {
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom>(mockClassrooms[0]);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6">
      {/* List Column */}
      <div className="w-full md:w-1/3 flex flex-col gap-4">
        <div className="flex justify-between items-center px-1">
            <h2 className="text-lg font-bold text-slate-800">Aulas</h2>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors shadow-sm font-medium">
                <Plus size={16} /> Nueva
            </button>
        </div>
        
        <div className="relative">
             <Search size={16} className="absolute left-3 top-3 text-slate-400" />
             <input type="text" placeholder="Buscar aula..." className="w-full bg-white border border-slate-200 rounded-lg py-2.5 pl-9 pr-4 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none shadow-sm transition-all" />
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          {mockClassrooms.map(room => (
            <div 
              key={room.id}
              onClick={() => setSelectedClassroom(room)}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                selectedClassroom.id === room.id 
                  ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200 shadow-sm' 
                  : 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className={`font-semibold text-sm ${selectedClassroom.id === room.id ? 'text-blue-800' : 'text-slate-800'}`}>{room.name}</h3>
                {selectedClassroom.id === room.id && <div className="w-2 h-2 rounded-full bg-blue-500"></div>}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Laptop size={12} /> {room.computerCount} Equipos</span>
                <span className={`px-2 py-0.5 rounded-full border ${room.activeGroup !== 'None' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {room.activeGroup}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Column */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
        {/* Header of Detail */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-1">{selectedClassroom.name}</h2>
                    <p className="text-slate-500 text-sm">Configuración y estado del aula</p>
                </div>
                <div className="flex gap-2">
                    <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100" title="Eliminar Aula">
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>
            
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Grupo Activo</label>
                    <select className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-blue-500 outline-none shadow-sm">
                        <option value="grupo-qa-1">grupo-qa-1</option>
                        <option value="test-group">test-group-verification</option>
                        <option value="none">Sin grupo activo</option>
                    </select>
                </div>
                 <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 flex items-center justify-between">
                    <div>
                         <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Estado</label>
                         <span className="text-green-700 font-medium flex items-center gap-2 text-sm"><div className="w-2 h-2 bg-green-500 rounded-full"></div> Operativo</span>
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
                    <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 border border-slate-200 font-medium">Total: {selectedClassroom.computerCount}</span>
                </div>
                
                {/* Empty State Style */}
                <div className="flex-1 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
                    <Monitor size={48} className="text-slate-300 mb-3" />
                    <p className="text-slate-900 font-medium text-sm">Sin máquinas activas</p>
                    <p className="text-slate-500 text-xs mt-1 max-w-xs">Instala el agente de OpenPath en los equipos para verlos aquí.</p>
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
                    <button className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline">
                        Configurar Horario
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Classrooms;