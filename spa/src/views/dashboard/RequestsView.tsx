import { useState, useEffect, useCallback } from 'react';
import { trpc } from '../../lib/trpc';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../stores/appStore';

type RequestStatus = 'pending' | 'approved' | 'rejected';

interface DomainRequest {
  id: string;
  domain: string;
  reason: string;
  requesterEmail: string;
  groupId: string;
  priority: 'low' | 'normal' | 'high';
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote?: string;
}

export default function RequestsView() {
  const [requests, setRequests] = useState<DomainRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('pending');
  const [selectedGroups, setSelectedGroups] = useState<Record<string, string>>({});

  const { isAdmin, isTeacher, user } = useAuth();
  const allGroups = useAppStore((state) => state.allGroups);

  const teacherGroupNames = user?.roles
    .filter((r) => r.role === 'teacher')
    .flatMap((r) => r.groupIds) || [];

  const availableGroups = isAdmin 
    ? allGroups 
    : allGroups.filter((g) => teacherGroupNames.includes(g.name));

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const statusParam = statusFilter === 'all' ? undefined : statusFilter;
      const result = await trpc.requests.list.query({ status: statusParam }) as DomainRequest[];
      setRequests(result);
    } catch (err) {
      console.error('Error loading requests:', err);
      alert('Error al cargar solicitudes');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const handleApprove = async (requestId: string) => {
    const groupId = selectedGroups[requestId];
    if (!groupId) {
      alert('Selecciona un grupo primero');
      return;
    }

    try {
      await trpc.requests.approve.mutate({ id: requestId, groupId });
      await loadRequests();
    } catch (err) {
      console.error('Error approving request:', err);
      alert('Error al aprobar: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleReject = async (requestId: string) => {
    const reason = prompt('Razón del rechazo (opcional):');
    if (reason === null) return;

    try {
      await trpc.requests.reject.mutate({ id: requestId, reason: reason || undefined });
      await loadRequests();
    } catch (err) {
      console.error('Error rejecting request:', err);
      alert('Error al rechazar: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDelete = async (requestId: string) => {
    if (!confirm('¿Eliminar esta solicitud?')) return;

    try {
      await trpc.requests.delete.mutate({ id: requestId });
      await loadRequests();
    } catch (err) {
      console.error('Error deleting request:', err);
      alert('Error al eliminar: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const canApproveRequest = (request: DomainRequest): boolean => {
    if (isAdmin) return true;
    if (isTeacher) {
      return teacherGroupNames.includes(request.groupId);
    }
    return false;
  };

  const getStatusBadgeVariant = (status: RequestStatus): 'default' | 'success' | 'warning' | 'danger' => {
    if (status === 'approved') return 'success';
    if (status === 'rejected') return 'danger';
    return 'warning';
  };

  const getPriorityBadgeVariant = (priority: string): 'default' | 'success' | 'warning' | 'danger' => {
    if (priority === 'high') return 'danger';
    if (priority === 'normal') return 'warning';
    return 'default';
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Justo ahora';
    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const rejectedCount = requests.filter((r) => r.status === 'rejected').length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Solicitudes de Desbloqueo</h2>
              <p className="mt-1 text-sm text-slate-600">Revisión y aprobación de solicitudes de acceso a dominios</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6 border-b border-gray-200">
            <button
              onClick={() => { setStatusFilter('pending'); }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter === 'pending'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Pendientes ({pendingCount})
            </button>
            <button
              onClick={() => { setStatusFilter('approved'); }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter === 'approved'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Aprobadas ({approvedCount})
            </button>
            <button
              onClick={() => { setStatusFilter('rejected'); }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter === 'rejected'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Rechazadas ({rejectedCount})
            </button>
            <button
              onClick={() => { setStatusFilter('all'); }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Todas ({requests.length})
            </button>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-gray-500">Cargando solicitudes...</div>
          ) : requests.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              {statusFilter === 'pending' ? 'No hay solicitudes pendientes' : 'No hay solicitudes'}
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((request) => {
                const canApprove = canApproveRequest(request);
                const isPending = request.status === 'pending';
                const selectedGroup = selectedGroups[request.id] || request.groupId || '';

                return (
                  <div
                    key={request.id}
                    className={`border border-gray-200 rounded-lg p-4 ${
                      !canApprove && isPending ? 'bg-gray-50' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-base font-semibold text-gray-900 truncate">
                            {request.domain}
                          </span>
                          <Badge variant={getStatusBadgeVariant(request.status)}>
                            {request.status === 'pending' && 'Pendiente'}
                            {request.status === 'approved' && 'Aprobada'}
                            {request.status === 'rejected' && 'Rechazada'}
                          </Badge>
                          {request.priority !== 'normal' && (
                            <Badge variant={getPriorityBadgeVariant(request.priority)}>
                              {request.priority === 'high' && 'Alta'}
                              {request.priority === 'low' && 'Baja'}
                            </Badge>
                          )}
                        </div>

                        <div className="text-sm text-gray-600 mb-2">
                          <span className="font-medium">{request.requesterEmail}</span>
                          <span className="mx-2">•</span>
                          <span>{formatDate(request.createdAt)}</span>
                        </div>

                        <p className="text-sm text-gray-700 italic mb-2">{request.reason}</p>

                        {request.groupId && (
                          <div className="text-xs text-gray-500">
                            Grupo: <span className="font-medium">{request.groupId}</span>
                          </div>
                        )}

                        {request.resolvedBy && (
                          <div className="text-xs text-gray-500 mt-1">
                            Resuelto por: <span className="font-medium">{request.resolvedBy}</span>
                            {request.resolutionNote && ` - ${request.resolutionNote}`}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {isPending && canApprove ? (
                          <>
                            <select
                              value={selectedGroup}
                              onChange={(e) =>
                                { setSelectedGroups({ ...selectedGroups, [request.id]: e.target.value }); }
                              }
                              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">Seleccionar grupo...</option>
                              {availableGroups.map((group) => (
                                <option key={group.name} value={group.name}>
                                  {group.name}
                                </option>
                              ))}
                            </select>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                onClick={() => void handleApprove(request.id)}
                                disabled={!selectedGroup}
                              >
                                ✓ Aprobar
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => void handleReject(request.id)}
                              >
                                ✗ Rechazar
                              </Button>
                            </div>
                          </>
                        ) : isPending && !canApprove ? (
                          <Badge variant="default">Solo lectura</Badge>
                        ) : (
                          isAdmin && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => void handleDelete(request.id)}
                            >
                              🗑️ Eliminar
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
