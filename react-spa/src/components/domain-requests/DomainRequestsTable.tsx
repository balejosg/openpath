import type { DomainRequest } from '@openpath/api';
import { CheckCircle, CheckCircle2, Clock, Search, Trash2, XCircle } from 'lucide-react';
import { STATUS_COLORS, STATUS_LABELS } from '../../views/domain-requests.constants';

interface DomainRequestsTableProps {
  paginatedRequests: DomainRequest[];
  filteredRequests: DomainRequest[];
  sortedRequests: DomainRequest[];
  hasActiveFilters: boolean;
  selectedRequestIds: string[];
  pendingIdsInPage: string[];
  canBulkSelectInPage: boolean;
  bulkSelectTitle: string;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  getGroupName: (groupId: string) => string;
  formatDate: (date: string) => string;
  onToggleSelectAllInPage: () => void;
  onToggleRequestSelection: (requestId: string) => void;
  onOpenApprove: (request: DomainRequest) => void;
  onOpenReject: (request: DomainRequest) => void;
  onOpenDelete: (request: DomainRequest) => void;
  onChangePage: (updater: number | ((page: number) => number)) => void;
  onClearFilters: () => void;
}

export function DomainRequestsTable({
  paginatedRequests,
  filteredRequests,
  sortedRequests,
  hasActiveFilters,
  selectedRequestIds,
  pendingIdsInPage,
  canBulkSelectInPage,
  bulkSelectTitle,
  currentPage,
  pageSize,
  totalPages,
  getGroupName,
  formatDate,
  onToggleSelectAllInPage,
  onToggleRequestSelection,
  onOpenApprove,
  onOpenReject,
  onOpenDelete,
  onChangePage,
  onClearFilters,
}: DomainRequestsTableProps) {
  if (filteredRequests.length === 0 && !hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] bg-white rounded-lg border border-slate-200 shadow-sm text-slate-500">
        <div className="bg-green-50 p-4 rounded-full mb-4">
          <CheckCircle2 size={48} className="text-green-500" />
        </div>
        <h2 className="text-xl font-semibold text-slate-800">Todo en orden</h2>
        <p className="mt-2 text-slate-500 text-sm">
          No hay solicitudes de dominio pendientes de revisión.
        </p>
      </div>
    );
  }

  if (filteredRequests.length === 0 && hasActiveFilters) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-sm text-center">
        <Search size={32} className="mx-auto text-slate-300 mb-3" />
        <p className="text-slate-500">No hay solicitudes para los filtros seleccionados</p>
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
        >
          Limpiar filtros
        </button>
      </div>
    );
  }

  return (
    <>
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
                    onChange={onToggleSelectAllInPage}
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
                  Máquina
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Grupo
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
                        onChange={() => onToggleRequestSelection(request.id)}
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
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {request.machineHostname ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {getGroupName(request.groupId)}
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
                            onClick={() => onOpenApprove(request)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Aprobar"
                          >
                            <CheckCircle size={18} />
                          </button>
                          <button
                            onClick={() => onOpenReject(request)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Rechazar"
                          >
                            <XCircle size={18} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => onOpenDelete(request)}
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

      {sortedRequests.length > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Mostrando {(currentPage - 1) * pageSize + 1}-
            {Math.min(currentPage * pageSize, sortedRequests.length)} de {sortedRequests.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onChangePage((page) => Math.max(1, page - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1 border border-slate-300 rounded disabled:opacity-50"
            >
              Anterior
            </button>
            <span>
              Pagina {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => onChangePage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1 border border-slate-300 rounded disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </>
  );
}
