import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DomainRequestsTableModel } from '../../../hooks/useDomainRequestsViewModel';
import { DomainRequestsTable } from '../DomainRequestsTable';

const pendingRow = {
  id: 'req-1',
  domain: 'example.com',
  status: 'pending',
  statusLabel: 'Pendiente',
  statusClassName: 'bg-amber-100 text-amber-700 border-amber-200',
  reason: 'Necesario para clase',
  machineHostname: 'host-1',
  groupName: 'Grupo 1',
  sourceSummary: 'Manual/API · Origen: teacher.local · Host: host-1',
  formattedCreatedAt: '01/04/2026',
  selected: false,
  selectable: true,
  reviewable: true,
} as const;

function buildModel(overrides: Partial<DomainRequestsTableModel> = {}): DomainRequestsTableModel {
  return {
    rows: [pendingRow],
    emptyState: null,
    canDeleteRequests: true,
    onClearFilters: vi.fn(),
    bulkSelection: {
      canSelectPage: true,
      title: 'Seleccionar',
      allPagePendingSelected: false,
      onToggleSelectPage: vi.fn(),
      onToggleRequest: vi.fn(),
    },
    pagination: {
      currentPage: 1,
      pageSize: 20,
      totalPages: 1,
      totalItems: 1,
      visibleStart: 1,
      visibleEnd: 1,
      onChangePage: vi.fn(),
    },
    onOpenApprove: vi.fn(),
    onOpenReject: vi.fn(),
    onOpenDelete: vi.fn(),
    ...overrides,
  };
}

describe('DomainRequestsTable', () => {
  it('renders pending rows and dispatches row-level actions', () => {
    const onOpenApprove = vi.fn();
    const onOpenReject = vi.fn();
    const onOpenDelete = vi.fn();
    const onToggleRequest = vi.fn();
    const onToggleSelectPage = vi.fn();

    render(
      <DomainRequestsTable
        model={buildModel({
          onOpenApprove,
          onOpenReject,
          onOpenDelete,
          bulkSelection: {
            canSelectPage: true,
            title: 'Seleccionar',
            allPagePendingSelected: false,
            onToggleSelectPage,
            onToggleRequest,
          },
        })}
      />
    );

    fireEvent.click(screen.getByLabelText('Seleccion masiva de pagina'));
    fireEvent.click(screen.getByLabelText('Seleccionar example.com'));
    fireEvent.click(screen.getByTitle('Aprobar'));
    fireEvent.click(screen.getByTitle('Rechazar'));
    fireEvent.click(screen.getByTitle('Eliminar'));

    expect(onToggleSelectPage).toHaveBeenCalled();
    expect(onToggleRequest).toHaveBeenCalledWith('req-1');
    expect(onOpenApprove).toHaveBeenCalledWith('req-1');
    expect(onOpenReject).toHaveBeenCalledWith('req-1');
    expect(onOpenDelete).toHaveBeenCalledWith('req-1');
  });

  it('can hide delete actions while keeping approve and reject available', () => {
    render(
      <DomainRequestsTable
        model={buildModel({
          canDeleteRequests: false,
        })}
      />
    );

    expect(screen.getByTitle('Aprobar')).toBeInTheDocument();
    expect(screen.getByTitle('Rechazar')).toBeInTheDocument();
    expect(screen.queryByTitle('Eliminar')).not.toBeInTheDocument();
  });
});
