import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DomainRequestsTable } from '../DomainRequestsTable';

const pendingRequest = {
  id: 'req-1',
  domain: 'example.com',
  groupId: 'group-1',
  status: 'pending',
  reason: 'Necesario para clase',
  requesterEmail: 'teacher@example.com',
  source: 'manual',
  originHost: 'teacher.local',
  machineHostname: 'host-1',
  clientVersion: null,
  errorType: null,
  createdAt: '2026-04-01T10:00:00.000Z',
  updatedAt: '2026-04-01T10:00:00.000Z',
  resolvedAt: null,
  resolvedBy: null,
} as const;

describe('DomainRequestsTable', () => {
  it('renders pending rows and dispatches row-level actions', () => {
    const onOpenApprove = vi.fn();
    const onOpenReject = vi.fn();
    const onOpenDelete = vi.fn();
    const onToggleRequestSelection = vi.fn();
    const onToggleSelectAllInPage = vi.fn();

    render(
      <DomainRequestsTable
        paginatedRequests={[pendingRequest]}
        filteredRequests={[pendingRequest]}
        sortedRequests={[pendingRequest]}
        hasActiveFilters={false}
        selectedRequestIds={[]}
        pendingIdsInPage={['req-1']}
        canBulkSelectInPage
        bulkSelectTitle="Seleccionar"
        currentPage={1}
        pageSize={20}
        totalPages={1}
        getGroupName={() => 'Grupo 1'}
        formatDate={() => '01/04/2026'}
        onToggleSelectAllInPage={onToggleSelectAllInPage}
        onToggleRequestSelection={onToggleRequestSelection}
        onOpenApprove={onOpenApprove}
        onOpenReject={onOpenReject}
        onOpenDelete={onOpenDelete}
        onChangePage={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('Seleccion masiva de pagina'));
    fireEvent.click(screen.getByLabelText('Seleccionar example.com'));
    fireEvent.click(screen.getByTitle('Aprobar'));
    fireEvent.click(screen.getByTitle('Rechazar'));
    fireEvent.click(screen.getByTitle('Eliminar'));

    expect(onToggleSelectAllInPage).toHaveBeenCalled();
    expect(onToggleRequestSelection).toHaveBeenCalledWith('req-1');
    expect(onOpenApprove).toHaveBeenCalledWith(pendingRequest);
    expect(onOpenReject).toHaveBeenCalledWith(pendingRequest);
    expect(onOpenDelete).toHaveBeenCalledWith(pendingRequest);
  });
});
