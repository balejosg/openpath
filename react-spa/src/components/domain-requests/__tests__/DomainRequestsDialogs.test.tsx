import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DomainRequestsDialogsModel } from '../../../hooks/useDomainRequestsViewModel';
import { DomainRequestsDialogs } from '../DomainRequestsDialogs';

const request = {
  domain: 'example.com',
  machineHostname: 'host-1',
  groupName: 'Grupo 1',
} as const;

function buildModel(
  overrides: Partial<DomainRequestsDialogsModel> = {}
): DomainRequestsDialogsModel {
  return {
    bulkConfirm: null,
    approveModal: { open: false, request: null },
    rejectModal: { open: false, request: null },
    deleteModal: { open: false, request: null },
    rejectionReason: '',
    actionsLoading: false,
    onBulkConfirmClose: vi.fn(),
    onBulkApproveConfirm: vi.fn(),
    onBulkRejectConfirm: vi.fn(),
    onApproveClose: vi.fn(),
    onApproveConfirm: vi.fn(),
    onRejectClose: vi.fn(),
    onRejectConfirm: vi.fn(),
    onRejectReasonChange: vi.fn(),
    onDeleteClose: vi.fn(),
    onDeleteConfirm: vi.fn(),
    ...overrides,
  };
}

describe('DomainRequestsDialogs', () => {
  it('confirms bulk approvals and propagates single-request rejection input', () => {
    const onBulkApproveConfirm = vi.fn();
    const onRejectReasonChange = vi.fn();

    render(
      <DomainRequestsDialogs
        model={buildModel({
          bulkConfirm: { mode: 'approve', requestIds: ['req-1', 'req-2'] },
          rejectModal: { open: true, request },
          onBulkApproveConfirm,
          onRejectReasonChange,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    fireEvent.change(screen.getByPlaceholderText('Explica por qué se rechaza esta solicitud...'), {
      target: { value: 'No aplica' },
    });

    expect(onBulkApproveConfirm).toHaveBeenCalledWith(['req-1', 'req-2']);
    expect(onRejectReasonChange).toHaveBeenCalledWith('No aplica');
  });
});
