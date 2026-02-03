import { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Trash2, Clock, AlertTriangle, Filter } from 'lucide-react';
import { trpc } from '../lib/trpc';

type RequestStatus = 'pending' | 'approved' | 'rejected';
type RequestPriority = 'low' | 'normal' | 'high' | 'urgent';

interface DomainRequest {
  id: string;
  domain: string;
  reason: string;
  requesterEmail: string;
  groupId: string;
  priority: RequestPriority;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote?: string;
}

interface Group {
  name: string;
  path: string;
}

const priorityColors: Record<RequestPriority, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  normal: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

const priorityLabels: Record<RequestPriority, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  normal: 'Normal',
  low: 'Baja',
};

const statusColors: Record<RequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

const statusLabels: Record<RequestStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

export default function DomainRequests() {
  const [requests, setRequests] = useState<DomainRequest[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');

  // Modal states
  const [approveModal, setApproveModal] = useState<{
    open: boolean;
    request: DomainRequest | null;
  }>({
    open: false,
    request: null,
  });
  const [rejectModal, setRejectModal] = useState<{ open: boolean; request: DomainRequest | null }>({
    open: false,
    request: null,
  });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; request: DomainRequest | null }>({
    open: false,
    request: null,
  });

  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch requests and groups
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [requestsData, groupsData] = await Promise.all([
          trpc.requests.list.query(statusFilter === 'all' ? {} : { status: statusFilter }),
          trpc.requests.listGroups.query(),
        ]);
        setRequests(requestsData as DomainRequest[]);
        setGroups(groupsData as Group[]);
        setError(null);
      } catch (err) {
        setError('Error al cargar las solicitudes');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, [statusFilter]);

  // Filter requests by search term
  const filteredRequests = requests.filter(
    (req) =>
      req.domain.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.requesterEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get group name by path
  const getGroupName = (groupId: string) => {
    const group = groups.find((g) => g.path === groupId);
    return group?.name ?? groupId;
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Handle approve
  const handleApprove = async () => {
    if (!approveModal.request || !selectedGroupId) return;
    setActionLoading(true);
    try {
      await trpc.requests.approve.mutate({
        id: approveModal.request.id,
        groupId: selectedGroupId,
      });
      setRequests((prev) =>
        prev.map((r) =>
          r.id === approveModal.request?.id ? { ...r, status: 'approved' as RequestStatus } : r
        )
      );
      setApproveModal({ open: false, request: null });
      setSelectedGroupId('');
    } catch (err) {
      console.error('Error approving request:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle reject
  const handleReject = async () => {
    if (!rejectModal.request) return;
    setActionLoading(true);
    try {
      await trpc.requests.reject.mutate({
        id: rejectModal.request.id,
        reason: rejectionReason || undefined,
      });
      setRequests((prev) =>
        prev.map((r) =>
          r.id === rejectModal.request?.id ? { ...r, status: 'rejected' as RequestStatus } : r
        )
      );
      setRejectModal({ open: false, request: null });
      setRejectionReason('');
    } catch (err) {
      console.error('Error rejecting request:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteModal.request) return;
    setActionLoading(true);
    try {
      await trpc.requests.delete.mutate({ id: deleteModal.request.id });
      setRequests((prev) => prev.filter((r) => r.id !== deleteModal.request?.id));
      setDeleteModal({ open: false, request: null });
    } catch (err) {
      console.error('Error deleting request:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Empty state
  if (!loading && filteredRequests.length === 0 && statusFilter === 'all' && !searchTerm) {
    return (
      <div className="space-y-6">
        {/* Description */}
        <p className="text-slate-500 text-sm">
          Gestiona las solicitudes de acceso a dominios bloqueados
        </p>

        {/* Empty state card */}
        <div className="flex flex-col items-center justify-center h-[50vh] bg-white rounded-lg border border-slate-200 shadow-sm text-slate-500">
          <div className="bg-green-50 p-4 rounded-full mb-4">
            <CheckCircle size={48} className="text-green-500" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800">Todo en orden</h2>
          <p className="mt-2 text-slate-500 text-sm">
            No hay solicitudes de dominio pendientes de revisión.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Description */}
      <p className="text-slate-500 text-sm">
        Gestiona las solicitudes de acceso a dominios bloqueados
      </p>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por dominio o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RequestStatus | 'all')}
              className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Todos</option>
              <option value="pending">Pendientes</option>
              <option value="approved">Aprobados</option>
              <option value="rejected">Rechazados</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="text-red-500" size={20} />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-sm flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Requests table */}
      {!loading && filteredRequests.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Dominio
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Solicitante
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Grupo
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Prioridad
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-slate-800">{request.domain}</div>
                        {request.reason && (
                          <div className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">
                            {request.reason}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{request.requesterEmail}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {getGroupName(request.groupId)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border font-medium ${priorityColors[request.priority]}`}
                      >
                        {priorityLabels[request.priority]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColors[request.status]}`}
                      >
                        {statusLabels[request.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                        <Clock size={14} />
                        {formatDate(request.createdAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {request.status === 'pending' && (
                          <>
                            <button
                              onClick={() => setApproveModal({ open: true, request })}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Aprobar"
                            >
                              <CheckCircle size={18} />
                            </button>
                            <button
                              onClick={() => setRejectModal({ open: true, request })}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Rechazar"
                            >
                              <XCircle size={18} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setDeleteModal({ open: true, request })}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No results after filtering */}
      {!loading && filteredRequests.length === 0 && (searchTerm || statusFilter !== 'all') && (
        <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-sm text-center">
          <Search size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">No se encontraron solicitudes con los filtros aplicados</p>
        </div>
      )}

      {/* Approve Modal */}
      {approveModal.open && approveModal.request && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Aprobar Solicitud</h3>
              <button
                onClick={() => setApproveModal({ open: false, request: null })}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle size={20} />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Aprobar acceso a <strong>{approveModal.request.domain}</strong> solicitado por{' '}
              <strong>{approveModal.request.requesterEmail}</strong>
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Grupo de destino
              </label>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Seleccionar grupo...</option>
                {groups.map((group) => (
                  <option key={group.name} value={group.name}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setApproveModal({ open: false, request: null })}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void handleApprove();
                }}
                disabled={!selectedGroupId || actionLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? 'Aprobando...' : 'Aprobar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal.open && rejectModal.request && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Rechazar Solicitud</h3>
              <button
                onClick={() => setRejectModal({ open: false, request: null })}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle size={20} />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Rechazar acceso a <strong>{rejectModal.request.domain}</strong> solicitado por{' '}
              <strong>{rejectModal.request.requesterEmail}</strong>
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Motivo del rechazo (opcional)
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explica por qué se rechaza esta solicitud..."
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRejectModal({ open: false, request: null })}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void handleReject();
                }}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Rechazando...' : 'Rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModal.open && deleteModal.request && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Eliminar Solicitud</h3>
              <button
                onClick={() => setDeleteModal({ open: false, request: null })}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle size={20} />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              ¿Estás seguro de que deseas eliminar la solicitud de acceso a{' '}
              <strong>{deleteModal.request.domain}</strong>? Esta acción no se puede deshacer.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal({ open: false, request: null })}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  void handleDelete();
                }}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
