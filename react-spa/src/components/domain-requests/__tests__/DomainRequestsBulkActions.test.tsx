import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DomainRequestsBulkActions } from '../DomainRequestsBulkActions';

describe('DomainRequestsBulkActions', () => {
  it('renders bulk controls and forwards button/input actions', () => {
    const onBulkRejectReasonChange = vi.fn();
    const onApproveSelected = vi.fn();
    const onRejectSelected = vi.fn();
    const onClearSelection = vi.fn();
    const onSelectFailed = vi.fn();
    const onRetryFailed = vi.fn();

    render(
      <DomainRequestsBulkActions
        selectedCount={2}
        bulkRejectReason=""
        bulkLoading={false}
        bulkProgress={{ mode: 'approve', done: 1, total: 2 }}
        bulkFailedIds={['req-2']}
        bulkMessage="Aprobadas 1. Fallaron 1."
        onBulkRejectReasonChange={onBulkRejectReasonChange}
        onApproveSelected={onApproveSelected}
        onRejectSelected={onRejectSelected}
        onClearSelection={onClearSelection}
        onSelectFailed={onSelectFailed}
        onRetryFailed={onRetryFailed}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Motivo para rechazo en lote (opcional)'), {
      target: { value: 'No procede' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar seleccionadas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar seleccionadas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar seleccion' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar fallidas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar fallidas' }));

    expect(onBulkRejectReasonChange).toHaveBeenCalledWith('No procede');
    expect(onApproveSelected).toHaveBeenCalled();
    expect(onRejectSelected).toHaveBeenCalled();
    expect(onClearSelection).toHaveBeenCalled();
    expect(onSelectFailed).toHaveBeenCalled();
    expect(onRetryFailed).toHaveBeenCalled();
    expect(screen.getByText('Aprobadas 1. Fallaron 1.')).toBeInTheDocument();
  });
});
