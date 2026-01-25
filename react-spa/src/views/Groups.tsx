import React from 'react';
import { MoreHorizontal, ShieldCheck, Folder, ArrowRight } from 'lucide-react';
import { Group } from '../types';

const mockGroups: Group[] = [
    { id: '1', name: 'cc', description: 'Acceso Controlado Común', domainCount: 0, status: 'Active' },
    { id: '2', name: 'test-group-verification', description: 'Grupo para pruebas de verificación', domainCount: 2, status: 'Active' },
    { id: '3', name: 'grupo-qa-1', description: 'QA Environment Alpha', domainCount: 5, status: 'Active' },
    { id: '4', name: 'grupo-qa-test-20260111', description: 'Test temporal expira 2026', domainCount: 0, status: 'Active' },
    { id: '5', name: 'test-e2e-group', description: 'Automation E2E', domainCount: 1, status: 'Inactive' },
];

const Groups = () => {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Grupos de Seguridad</h2>
                    <p className="text-slate-500 text-sm">Gestiona políticas de acceso y restricciones.</p>
                </div>
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
                    + Nuevo Grupo
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {mockGroups.map((group) => (
                    <div key={group.id} className="bg-white border border-slate-200 rounded-lg p-5 hover:border-blue-300 transition-all group relative shadow-sm hover:shadow-md">
                        <div className="absolute top-4 right-4 opacity-100">
                             <button className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded">
                                <MoreHorizontal size={18} />
                             </button>
                        </div>
                        
                        <div className="flex items-start gap-4 mb-4">
                            <div className={`p-3 rounded-lg ${group.status === 'Active' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                <Folder size={20} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900 text-sm">{group.name}</h3>
                                <p className="text-xs text-slate-500 mt-1 line-clamp-1">{group.description}</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm py-2 border-t border-slate-100 border-b">
                                <span className="text-slate-500 flex items-center gap-2 text-xs"><ShieldCheck size={14} /> Dominios</span>
                                <span className="font-medium text-slate-900">{group.domainCount}</span>
                            </div>
                            
                            <div className="flex justify-between items-center pt-1">
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${group.status === 'Active' ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                                    {group.status === 'Active' ? 'Activo' : 'Inactivo'}
                                </span>
                                <button className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium transition-opacity">
                                    Configurar <ArrowRight size={12} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Groups;