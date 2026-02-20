import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CheckCircle, XCircle, Trash2, Clock, AlertTriangle, Filter } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DomainRequest, RequestStatus } from '@openpath/api';
import { trpc } from '../lib/trpc';
import { normalizeSearchTerm, useNormalizedSearch } from '../hooks/useNormalizedSearch';
import {
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  PRIORITY_WEIGHT,
  STATUS_COLORS,
  STATUS_LABELS,
} from './domain-requests.constants';

type SortOption = 'pending' | 'newest' | 'oldest' | 'priority';

interface Group {
  id: string;
  name: string;
  path: string;
}

const EMPTY_REQUESTS: DomainRequest[] = [];
const EMPTY_GROUPS: Group[] = [];

function useDomainRequestsData(statusFilter: RequestStatus | 'all') {
  const queryClient = useQueryClient();

  // Avoid keeping Node test processes alive via refetch intervals.
  const shouldPoll = import.meta.env.MODE !== 'test';

  const requestsQuery = useQuery({
    queryKey: ['domain-requests', 'requests', statusFilter],
    queryFn: () => trpc.requests.list.query(statusFilter === 'all' ? {} : { status: statusFilter }),
    refetchInterval: shouldPoll ? 10000 : false,
    refetchOnWindowFocus: 'always',
  });

  const groupsQuery = useQuery({
    queryKey: ['domain-requests', 'groups'],
    queryFn: () => trpc.requests.listGroups.query(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: 'always',
  });

  const invalidateRequests = () =>
    queryClient.invalidateQueries({ queryKey: ['domain-requests', 'requests'] });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return await trpc.requests.approve.mutate({ id });
    },
    onSuccess: () => {
      void invalidateRequests();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (input: { id: string; reason?: string }) => {
      return await trpc.requests.reject.mutate(input);
    },
    onSuccess: () => {
      void invalidateRequests();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await trpc.requests.delete.mutate({ id });
    },
    onSuccess: () => {
      void invalidateRequests();
    },
  });

  const loading = requestsQuery.status === 'pending' || groupsQuery.status === 'pending';
  const fetching =
    requestsQuery.fetchStatus === 'fetching' || groupsQuery.fetchStatus === 'fetching';
  const hasError = requestsQuery.status === 'error' || groupsQuery.status === 'error';

  return {
    requests: requestsQuery.data ?? EMPTY_REQUESTS,
    groups: groupsQuery.data ?? EMPTY_GROUPS,
    loading,
    fetching,
    error: hasError ? 'Error al cargar las solicitudes' : null,
    invalidateRequests,
    approveRequest: approveMutation.mutateAsync,
    rejectRequest: rejectMutation.mutateAsync,
    deleteRequest: deleteMutation.mutateAsync,
    actionsLoading:
      approveMutation.status === 'pending' ||
      rejectMutation.status === 'pending' ||
      deleteMutation.status === 'pending',
  };
}

export default function DomainRequests() {
  const [searchTerm, setSearchTerm] = useState('');
  const normalizedSearchTerm = useNormalizedSearch(searchTerm);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'firefox-extension' | 'manual'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('pending');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    mode: 'approve' | 'reject';
    done: number;
    total: number;
  } | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkFailedIds, setBulkFailedIds] = useState<string[]>([]);
  const [bulkFailedMode, setBulkFailedMode] = useState<'approve' | 'reject' | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    requests,
    groups,
    loading: baseLoading,
    fetching,
    error,
    invalidateRequests,
    approveRequest,
    rejectRequest,
    deleteRequest,
    actionsLoading,
  } = useDomainRequestsData(statusFilter);

  const loading = baseLoading || fetching;

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

  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    if (!bulkMessage) return;
    const timeout = window.setTimeout(() => setBulkMessage(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [bulkMessage]);

  // Filter requests by search term
  const filteredRequests = useMemo(
    () =>
      requests.filter((req) => {
        const matchesSearch =
          !normalizedSearchTerm ||
          normalizeSearchTerm(req.domain).includes(normalizedSearchTerm) ||
          normalizeSearchTerm(req.requesterEmail).includes(normalizedSearchTerm);

        if (!matchesSearch) return false;
        if (sourceFilter === 'all') return true;
        if (sourceFilter === 'firefox-extension') return req.source === 'firefox-extension';
        return (req.source ?? 'manual') !== 'firefox-extension';
      }),
    [requests, normalizedSearchTerm, sourceFilter]
  );

  const sortedRequests = useMemo(() => {
    const sorted = [...filteredRequests];

    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'priority': {
          const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
          if (priorityDiff !== 0) return priorityDiff;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        case 'pending':
        default: {
          if (a.status === 'pending' && b.status !== 'pending') return -1;
          if (a.status !== 'pending' && b.status === 'pending') return 1;

          if (a.status === 'pending' && b.status === 'pending') {
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          }

          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }
      }
    });

    return sorted;
  }, [filteredRequests, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedRequests.length / pageSize));
  const paginatedRequests = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRequests.slice(start, start + pageSize);
  }, [sortedRequests, currentPage, pageSize]);

  const pendingIdsInPage = useMemo(
    () => paginatedRequests.filter((r) => r.status === 'pending').map((r) => r.id),
    [paginatedRequests]
  );

  const hasActiveFilters =
    normalizedSearchTerm.length > 0 || statusFilter !== 'all' || sourceFilter !== 'all';
  const canBulkSelectInPage = pendingIdsInPage.length > 0;
  const bulkSelectTitle = canBulkSelectInPage
    ? 'Seleccionar elementos pendientes de esta pagina'
    : statusFilter === 'approved' || statusFilter === 'rejected'
      ? 'Seleccion masiva no disponible en este filtro'
      : 'No hay elementos pendientes seleccionables en esta pagina';

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, sourceFilter, sortBy, pageSize]);

  useEffect(() => {
    setSelectedRequestIds((prev) => {
      const next = prev.filter((id) => sortedRequests.some((r) => r.id === id));
      if (next.length === prev.length && next.every((id, idx) => id === prev[idx])) {
        return prev;
      }
      return next;
    });
  }, [sortedRequests]);

  const selectedPendingRequests = useMemo(
    () => requests.filter((r) => r.status === 'pending' && selectedRequestIds.includes(r.id)),
    [requests, selectedRequestIds]
  );

  const groupNameByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      map.set(group.path, group.name);
    }
    return map;
  }, [groups]);

  // Get group name by path
  const getGroupName = (groupId: string) => groupNameByPath.get(groupId) ?? groupId;

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

  const pendingCount = useMemo(() => {
    return filteredRequests.reduce(
      (count, request) => (request.status === 'pending' ? count + 1 : count),
      0
    );
  }, [filteredRequests]);

  // Handle approve
  const handleApprove = async () => {
    if (!approveModal.request) return;
    try {
      await approveRequest(approveModal.request.id);
      setApproveModal({ open: false, request: null });
    } catch (err) {
      console.error('Error approving request:', err);
    }
  };

  // Handle reject
  const handleReject = async () => {
    if (!rejectModal.request) return;
    try {
      await rejectRequest({
        id: rejectModal.request.id,
        reason: rejectionReason || undefined,
      });
      setRejectModal({ open: false, request: null });
      setRejectionReason('');
    } catch (err) {
      console.error('Error rejecting request:', err);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteModal.request) return;
    try {
      await deleteRequest(deleteModal.request.id);
      setDeleteModal({ open: false, request: null });
    } catch (err) {
      console.error('Error deleting request:', err);
    }
  };

  const toggleRequestSelection = (requestId: string) => {
    setSelectedRequestIds((prev) =>
      prev.includes(requestId) ? prev.filter((id) => id !== requestId) : [...prev, requestId]
    );
  };

  const toggleSelectAllInPage = () => {
    const allSelected =
      pendingIdsInPage.length > 0 &&
      pendingIdsInPage.every((id) => selectedRequestIds.includes(id));

    if (allSelected) {
      setSelectedRequestIds((prev) => prev.filter((id) => !pendingIdsInPage.includes(id)));
      return;
    }

    setSelectedRequestIds((prev) => Array.from(new Set([...prev, ...pendingIdsInPage])));
  };

  const handleBulkApprove = async () => {
    if (selectedPendingRequests.length === 0) return;
    const confirmed = window.confirm(
      `¿Aprobar ${selectedPendingRequests.length} solicitudes seleccionadas?`
    );
    if (!confirmed) return;

    setBulkMessage(null);
    setBulkLoading(true);
    setBulkProgress({ mode: 'approve', done: 0, total: selectedPendingRequests.length });
    let successCount = 0;
    let failedCount = 0;
    let processedCount = 0;
    const failedIds: string[] = [];

    for (const req of selectedPendingRequests) {
      try {
        await trpc.requests.approve.mutate({ id: req.id });
        successCount++;
      } catch {
        failedCount++;
        failedIds.push(req.id);
      }
      processedCount++;
      setBulkProgress({
        mode: 'approve',
        done: processedCount,
        total: selectedPendingRequests.length,
      });
    }

    if (successCount > 0) {
      setSelectedRequestIds([]);
      void invalidateRequests();
    }

    setBulkMessage(
      failedCount > 0
        ? `Aprobadas ${successCount}. Fallaron ${failedCount}.`
        : `Aprobadas ${successCount} solicitudes.`
    );
    setBulkFailedIds(failedIds);
    setBulkFailedMode(failedCount > 0 ? 'approve' : null);
    setBulkProgress(null);
    setBulkLoading(false);
  };

  const handleBulkReject = async () => {
    if (selectedPendingRequests.length === 0) return;
    const confirmed = window.confirm(
      `¿Rechazar ${selectedPendingRequests.length} solicitudes seleccionadas?`
    );
    if (!confirmed) return;

    setBulkMessage(null);
    setBulkLoading(true);
    setBulkProgress({ mode: 'reject', done: 0, total: selectedPendingRequests.length });
    let successCount = 0;
    let failedCount = 0;
    let processedCount = 0;
    const failedIds: string[] = [];

    for (const req of selectedPendingRequests) {
      try {
        await trpc.requests.reject.mutate({ id: req.id, reason: bulkRejectReason || undefined });
        successCount++;
      } catch {
        failedCount++;
        failedIds.push(req.id);
      }
      processedCount++;
      setBulkProgress({
        mode: 'reject',
        done: processedCount,
        total: selectedPendingRequests.length,
      });
    }

    if (successCount > 0) {
      setSelectedRequestIds([]);
      setBulkRejectReason('');
      void invalidateRequests();
    }

    setBulkMessage(
      failedCount > 0
        ? `Rechazadas ${successCount}. Fallaron ${failedCount}.`
        : `Rechazadas ${successCount} solicitudes.`
    );
    setBulkFailedIds(failedIds);
    setBulkFailedMode(failedCount > 0 ? 'reject' : null);
    setBulkProgress(null);
    setBulkLoading(false);
  };

  const handleRetryFailed = async () => {
    if (bulkFailedIds.length === 0 || !bulkFailedMode) return;

    const retryCandidates = requests.filter(
      (r) => r.status === 'pending' && bulkFailedIds.includes(r.id)
    );
    if (retryCandidates.length === 0) {
      setBulkMessage('No hay solicitudes fallidas pendientes para reintentar.');
      setBulkFailedIds([]);
      setBulkFailedMode(null);
      return;
    }

    setSelectedRequestIds(retryCandidates.map((r) => r.id));

    if (bulkFailedMode === 'approve') {
      await handleBulkApprove();
      return;
    }

    await handleBulkReject();
  };

  const clearSearch = () => {
    setSearchTerm('');
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
      searchInputRef.current.focus();
    }
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setSourceFilter('all');
    clearSearch();
  };

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
              ref={searchInputRef}
              type="text"
              name="domain-requests-search"
              autoComplete="off"
              placeholder="Buscar por dominio o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={(e) => {
                if (e.currentTarget.value !== searchTerm) {
                  setSearchTerm(e.currentTarget.value);
                }
              }}
              className="w-full pl-10 pr-24 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Limpiar busqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Limpiar
            </button>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RequestStatus | 'all')}
              aria-label="Filtrar por estado"
              className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Todos</option>
              <option value="pending">Pendientes</option>
              <option value="approved">Aprobados</option>
              <option value="rejected">Rechazados</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label="Ordenar solicitudes"
              className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="pending">Pendientes primero</option>
              <option value="newest">Mas nuevas</option>
              <option value="oldest">Mas antiguas</option>
              <option value="priority">Prioridad</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) =>
                setSourceFilter(e.target.value as 'all' | 'firefox-extension' | 'manual')
              }
              aria-label="Filtrar por fuente"
              className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Todas las fuentes</option>
              <option value="firefox-extension">Firefox Extension</option>
              <option value="manual">Manual/API</option>
            </select>
            <select
              value={String(pageSize)}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Elementos por pagina"
              className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="10">10/pag</option>
              <option value="20">20/pag</option>
              <option value="50">50/pag</option>
            </select>
          </div>
        </div>
      </div>

      {!loading && pendingCount > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium text-slate-700">Pendientes: {pendingCount}</span>
          </div>
        </div>
      )}

      {selectedPendingRequests.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <div className="text-sm text-blue-900 font-medium">
            {selectedPendingRequests.length} solicitudes pendientes seleccionadas
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              value={bulkRejectReason}
              onChange={(e) => setBulkRejectReason(e.target.value)}
              placeholder="Motivo para rechazo en lote (opcional)"
              className="px-3 py-2 border border-blue-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                void handleBulkApprove();
              }}
              disabled={bulkLoading}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg disabled:opacity-50"
            >
              {bulkLoading ? 'Procesando...' : 'Aprobar seleccionadas'}
            </button>
            <button
              onClick={() => {
                void handleBulkReject();
              }}
              disabled={bulkLoading}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg disabled:opacity-50"
            >
              {bulkLoading ? 'Procesando...' : 'Rechazar seleccionadas'}
            </button>
            <button
              onClick={() => {
                setSelectedRequestIds([]);
                setBulkFailedIds([]);
                setBulkFailedMode(null);
                setBulkRejectReason('');
              }}
              disabled={bulkLoading}
              className="px-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm rounded-lg disabled:opacity-50"
            >
              Limpiar seleccion
            </button>
          </div>
          {bulkProgress && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-blue-900">
                <span>
                  {bulkProgress.mode === 'approve'
                    ? 'Aprobando en lote...'
                    : 'Rechazando en lote...'}
                </span>
                <span>
                  {bulkProgress.done}/{bulkProgress.total}
                </span>
              </div>
              <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600"
                  style={{
                    width: `${Math.round((bulkProgress.done / Math.max(1, bulkProgress.total)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
          {bulkFailedIds.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-red-700">Fallidas: {bulkFailedIds.length}</span>
              <button
                onClick={() => setSelectedRequestIds(bulkFailedIds)}
                disabled={bulkLoading}
                className="px-2 py-1 bg-white border border-red-300 text-red-700 rounded disabled:opacity-50"
              >
                Seleccionar fallidas
              </button>
              <button
                onClick={() => {
                  void handleRetryFailed();
                }}
                disabled={bulkLoading}
                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50"
              >
                Reintentar fallidas
              </button>
            </div>
          )}
        </div>
      )}

      {bulkMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="text-green-600" size={20} />
          <span className="text-green-800 text-sm">{bulkMessage}</span>
        </div>
      )}

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
      {!loading && sortedRequests.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3">
                    <input
                      type="checkbox"
                      checked={
                        canBulkSelectInPage &&
                        pendingIdsInPage.every((id) => selectedRequestIds.includes(id))
                      }
                      onChange={toggleSelectAllInPage}
                      disabled={!canBulkSelectInPage}
                      className="rounded border-slate-300"
                      title={bulkSelectTitle}
                      aria-label="Seleccion masiva de pagina"
                    />
                  </th>
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
                {paginatedRequests.map((request) => (
                  <tr
                    key={request.id}
                    data-testid="request-row"
                    data-status={request.status}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      {request.status === 'pending' ? (
                        <input
                          type="checkbox"
                          checked={selectedRequestIds.includes(request.id)}
                          onChange={() => toggleRequestSelection(request.id)}
                          className="rounded border-slate-300"
                          aria-label={`Seleccionar ${request.domain}`}
                        />
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div data-testid="domain-name" className="font-medium text-slate-800">
                          {request.domain}
                        </div>
                        {request.reason && (
                          <div className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">
                            {request.reason}
                          </div>
                        )}
                        <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">
                          {(request.source ?? 'manual') === 'firefox-extension'
                            ? `Firefox${request.clientVersion ? ` v${request.clientVersion}` : ''}`
                            : 'Manual/API'}
                          {request.originHost ? ` · Origen: ${request.originHost}` : ''}
                          {request.machineHostname ? ` · Host: ${request.machineHostname}` : ''}
                          {request.errorType ? ` · Error: ${request.errorType}` : ''}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{request.requesterEmail}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {getGroupName(request.groupId)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_COLORS[request.priority]}`}
                      >
                        {PRIORITY_LABELS[request.priority]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[request.status]}`}
                      >
                        {STATUS_LABELS[request.status]}
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

      {/* Empty state */}
      {!loading && filteredRequests.length === 0 && !hasActiveFilters && (
        <div className="flex flex-col items-center justify-center h-[50vh] bg-white rounded-lg border border-slate-200 shadow-sm text-slate-500">
          <div className="bg-green-50 p-4 rounded-full mb-4">
            <CheckCircle size={48} className="text-green-500" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800">Todo en orden</h2>
          <p className="mt-2 text-slate-500 text-sm">
            No hay solicitudes de dominio pendientes de revisión.
          </p>
        </div>
      )}

      {/* No results after filtering */}
      {!loading && filteredRequests.length === 0 && hasActiveFilters && (
        <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-sm text-center">
          <Search size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">No hay solicitudes para los filtros seleccionados</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {!loading && sortedRequests.length > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Mostrando {(currentPage - 1) * pageSize + 1}-
            {Math.min(currentPage * pageSize, sortedRequests.length)} de {sortedRequests.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1 border border-slate-300 rounded disabled:opacity-50"
            >
              Anterior
            </button>
            <span>
              Pagina {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1 border border-slate-300 rounded disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
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

            <p className="text-sm text-slate-600 mb-4">
              La solicitud se aprobara en el grupo original:{' '}
              <strong>{getGroupName(approveModal.request.groupId)}</strong>
            </p>

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
                disabled={actionsLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionsLoading ? 'Aprobando...' : 'Aprobar'}
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
                disabled={actionsLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {actionsLoading ? 'Rechazando...' : 'Rechazar'}
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
                disabled={actionsLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {actionsLoading ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
