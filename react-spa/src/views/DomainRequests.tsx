import { useRef, useState } from 'react';
import type { RequestStatus } from '@openpath/api';
import { AlertTriangle } from 'lucide-react';
import { DomainRequestsBulkActions } from '../components/domain-requests/DomainRequestsBulkActions';
import { DomainRequestsDialogs } from '../components/domain-requests/DomainRequestsDialogs';
import { DomainRequestsFilters } from '../components/domain-requests/DomainRequestsFilters';
import { DomainRequestsTable } from '../components/domain-requests/DomainRequestsTable';
import { useDomainRequestsBulkActions } from '../hooks/useDomainRequestsBulkActions';
import { useDomainRequestsData } from '../hooks/useDomainRequestsData';
import { useDomainRequestsDialogs } from '../hooks/useDomainRequestsDialogs';
import { useDomainRequestsState } from '../hooks/useDomainRequestsState';

export default function DomainRequests() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');

  const {
    requests,
    groups,
    loading: baseLoading,
    fetching,
    error,
    approveRequest,
    rejectRequest,
    deleteRequest,
    actionsLoading,
  } = useDomainRequestsData(statusFilter);

  const {
    searchTerm,
    setSearchTerm,
    sourceFilter,
    setSourceFilter,
    sortBy,
    setSortBy,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    selectedRequestIds,
    setSelectedRequestIds,
    filteredRequests,
    sortedRequests,
    paginatedRequests,
    pendingIdsInPage,
    selectedPendingRequests,
    pendingCount,
    hasActiveFilters,
    canBulkSelectInPage,
    bulkSelectTitle,
    totalPages,
    getGroupName,
    toggleRequestSelection,
    toggleSelectAllInPage,
  } = useDomainRequestsState({ requests, groups, statusFilter });

  const loading = baseLoading || fetching;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const bulkActions = useDomainRequestsBulkActions({
    requests,
    selectedPendingRequests,
    setSelectedRequestIds,
    approveRequest,
    rejectRequest,
  });

  const dialogs = useDomainRequestsDialogs({
    approveRequest,
    rejectRequest,
    deleteRequest,
  });

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
      <p className="text-slate-500 text-sm">
        Gestiona las solicitudes de acceso a dominios bloqueados
      </p>

      <DomainRequestsFilters
        searchInputRef={searchInputRef}
        searchTerm={searchTerm}
        statusFilter={statusFilter}
        sortBy={sortBy}
        sourceFilter={sourceFilter}
        pageSize={pageSize}
        onSearchChange={setSearchTerm}
        onStatusFilterChange={setStatusFilter}
        onSortChange={setSortBy}
        onSourceFilterChange={setSourceFilter}
        onPageSizeChange={setPageSize}
        onClearSearch={clearSearch}
      />

      {!loading && pendingCount > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium text-slate-700">Pendientes: {pendingCount}</span>
          </div>
        </div>
      )}

      <DomainRequestsBulkActions
        selectedCount={selectedPendingRequests.length}
        bulkRejectReason={bulkActions.bulkRejectReason}
        bulkLoading={bulkActions.bulkLoading}
        bulkProgress={bulkActions.bulkProgress}
        bulkFailedIds={bulkActions.bulkFailedIds}
        bulkMessage={bulkActions.bulkMessage}
        onBulkRejectReasonChange={bulkActions.setBulkRejectReason}
        onApproveSelected={bulkActions.openBulkApproveConfirm}
        onRejectSelected={bulkActions.openBulkRejectConfirm}
        onClearSelection={bulkActions.clearBulkSelection}
        onSelectFailed={() => setSelectedRequestIds(bulkActions.bulkFailedIds)}
        onRetryFailed={bulkActions.handleRetryFailed}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="text-red-500" size={20} />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {loading && (
        <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-sm flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {!loading && !error && (
        <DomainRequestsTable
          paginatedRequests={paginatedRequests}
          filteredRequests={filteredRequests}
          sortedRequests={sortedRequests}
          hasActiveFilters={hasActiveFilters}
          selectedRequestIds={selectedRequestIds}
          pendingIdsInPage={pendingIdsInPage}
          canBulkSelectInPage={canBulkSelectInPage}
          bulkSelectTitle={bulkSelectTitle}
          currentPage={currentPage}
          pageSize={pageSize}
          totalPages={totalPages}
          getGroupName={getGroupName}
          formatDate={formatDate}
          onToggleSelectAllInPage={toggleSelectAllInPage}
          onToggleRequestSelection={toggleRequestSelection}
          onOpenApprove={(request) => dialogs.setApproveModal({ open: true, request })}
          onOpenReject={(request) => dialogs.setRejectModal({ open: true, request })}
          onOpenDelete={(request) => dialogs.setDeleteModal({ open: true, request })}
          onChangePage={(updater) =>
            setCurrentPage((page) => (typeof updater === 'function' ? updater(page) : updater))
          }
          onClearFilters={clearFilters}
        />
      )}

      <DomainRequestsDialogs
        bulkConfirm={bulkActions.bulkConfirm}
        approveModal={dialogs.approveModal}
        rejectModal={dialogs.rejectModal}
        deleteModal={dialogs.deleteModal}
        rejectionReason={dialogs.rejectionReason}
        actionsLoading={actionsLoading || bulkActions.bulkLoading}
        onBulkConfirmClose={() => bulkActions.setBulkConfirm(null)}
        onBulkApproveConfirm={(requestIds) => {
          bulkActions.setBulkConfirm(null);
          void bulkActions.runBulkApprove(requestIds);
        }}
        onBulkRejectConfirm={(requestIds, reason) => {
          bulkActions.setBulkConfirm(null);
          void bulkActions.runBulkReject(requestIds, reason);
        }}
        onApproveClose={() => dialogs.setApproveModal({ open: false, request: null })}
        onApproveConfirm={dialogs.handleApprove}
        onRejectClose={() => {
          dialogs.setRejectModal({ open: false, request: null });
          dialogs.setRejectionReason('');
        }}
        onRejectConfirm={dialogs.handleReject}
        onRejectReasonChange={dialogs.setRejectionReason}
        onDeleteClose={() => dialogs.setDeleteModal({ open: false, request: null })}
        onDeleteConfirm={dialogs.handleDelete}
        getGroupName={getGroupName}
      />
    </div>
  );
}
