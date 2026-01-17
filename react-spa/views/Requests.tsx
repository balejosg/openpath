import React, { useState } from 'react';
import { Search, Filter, CheckCircle, XCircle, Clock, Trash2, Globe, User, MessageSquare, ShieldCheck, RefreshCw } from 'lucide-react';
import { useRequests } from '../hooks/useRequests';
import { useGroups } from '../hooks/useGroups';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';

const RequestsView = () => {
    const [statusFilter, setStatusFilter] = useState<string | undefined>('pending');
    const { requests, isLoading, error, refetch, approveRequest, rejectRequest, deleteRequest } = useRequests(statusFilter);
    const { groups } = useGroups();
    
    const [selectedRequest, setSelectedRequest] = useState<any>(null);
    const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState<string>('');

    const handleApprove = async () => {
        if (!selectedRequest) return;
        try {
            await approveRequest({ id: selectedRequest.id, groupId: selectedGroupId || undefined });
            setIsApproveModalOpen(false);
            setSelectedRequest(null);
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    const handleReject = async (id: string) => {
        const reason = window.prompt('Motivo del rechazo (opcional):');
        if (reason !== null) {
            try {
                await rejectRequest({ id, reason: reason || undefined });
            } catch (err: any) {
                alert(`Error: ${err.message}`);
            }
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('¿Eliminar esta solicitud del historial?')) {
            try {
                await deleteRequest(id);
            } catch (err: any) {
                alert(`Error: ${err.message}`);
            }
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'approved': return 'bg-green-50 text-green-700 border-green-200';
            case 'rejected': return 'bg-red-50 text-red-700 border-red-200';
            default: return 'bg-slate-50 text-slate-700 border-slate-200';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pending': return <Clock size={14} />;
            case 'approved': return <CheckCircle size={14} />;
            case 'rejected': return <XCircle size={14} />;
            default: return null;
        }
    };

    if (isLoading) {
        return <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-slate-200 rounded" />
            <div className="bg-white h-16 rounded-lg border border-slate-200" />
            <div className="bg-white h-96 rounded-lg border border-slate-200" />
        </div>;
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-lg text-center">
                <h3 className="text-lg font-semibold mb-2">Error al cargar solicitudes</h3>
                <p className="text-sm mb-4">{error.message}</p>
                <Button variant="outline" onClick={() => refetch()}>
                    <RefreshCw size={16} className="mr-2" /> Reintentar
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Solicitudes de Acceso</h2>
                    <p className="text-slate-500 text-sm">Gestiona peticiones de desbloqueo de dominios.</p>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row gap-4 justify-between items-center shadow-sm">
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                    <button 
                        onClick={() => setStatusFilter('pending')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${statusFilter === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                    >
                        Pendientes
                    </button>
                    <button 
                        onClick={() => setStatusFilter('approved')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${statusFilter === 'approved' ? 'bg-green-100 text-green-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                    >
                        Aprobadas
                    </button>
                    <button 
                        onClick={() => setStatusFilter('rejected')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${statusFilter === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                    >
                        Rechazadas
                    </button>
                    <button 
                        onClick={() => setStatusFilter(undefined)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${statusFilter === undefined ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                    >
                        Todas
                    </button>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <RefreshCw size={16} className="mr-2" /> Refrescar
                    </Button>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-bold tracking-wider">
                                <th className="px-6 py-4">Dominio</th>
                                <th className="px-6 py-4">Solicitante</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {requests.map((request: any) => (
                                <tr key={request.id} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                                <Globe size={16} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-900">{request.domain}</p>
                                                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                                    <Clock size={10} />
                                                    {new Date(request.createdAt).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 text-sm text-slate-600">
                                            <User size={14} className="text-slate-400" />
                                            {request.requesterEmail}
                                        </div>
                                        {request.reason && (
                                            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1 italic">
                                                <MessageSquare size={12} />
                                                {request.reason}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${getStatusBadge(request.status)}`}>
                                            {getStatusIcon(request.status)}
                                            {request.status === 'pending' ? 'Pendiente' : request.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {request.status === 'pending' && (
                                                <>
                                                    <button 
                                                        onClick={() => {
                                                            setSelectedRequest(request);
                                                            setSelectedGroupId(request.groupId || '');
                                                            setIsApproveModalOpen(true);
                                                        }}
                                                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-green-100" 
                                                        title="Aprobar"
                                                    >
                                                        <CheckCircle size={18} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleReject(request.id)}
                                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-100" 
                                                        title="Rechazar"
                                                    >
                                                        <XCircle size={18} />
                                                    </button>
                                                </>
                                            )}
                                            {request.status !== 'pending' && (
                                                <button 
                                                    onClick={() => handleDelete(request.id)}
                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" 
                                                    title="Eliminar del historial"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {requests.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center">
                                            <CheckCircle size={48} className="text-slate-200 mb-2" />
                                            <p className="text-lg font-medium">Todo en orden</p>
                                            <p className="text-sm">No hay solicitudes que coincidan con el filtro.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Approve Modal */}
            <Modal
                isOpen={isApproveModalOpen}
                onClose={() => setIsApproveModalOpen(false)}
                title="Aprobar Solicitud"
            >
                <div className="space-y-4">
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                        <p className="text-xs text-blue-700 font-medium">Dominio a desbloquear:</p>
                        <p className="text-sm font-bold text-blue-900 font-mono mt-1">{selectedRequest?.domain}</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Añadir al grupo:</label>
                        <select 
                            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-blue-500 outline-none shadow-sm text-sm"
                            value={selectedGroupId}
                            onChange={e => setSelectedGroupId(e.target.value)}
                        >
                            <option value="">(Seleccionar grupo)</option>
                            {groups.map(g => (
                                <option key={g.id} value={g.id}>{g.displayName} ({g.name})</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-slate-400">Si no seleccionas un grupo, se usará el grupo original de la solicitud.</p>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="ghost" onClick={() => setIsApproveModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleApprove} disabled={!selectedGroupId && !selectedRequest?.groupId}>
                            Confirmar Aprobación
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default RequestsView;
