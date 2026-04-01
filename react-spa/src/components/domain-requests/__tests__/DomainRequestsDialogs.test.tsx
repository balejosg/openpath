import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DomainRequestsDialogs } from '../DomainRequestsDialogs';

const request = {
  id: 'req-1',
  domain: 'example.com',
  reason: 'Necesario para clase',
  requesterEmail: 'teacher@example.com',
  groupId: 'group-1',
  status: 'pending',
  createdAt: '2026-04-01T10:00:00.000Z',
  updatedAt: '2026-04-01T10:00:00.000Z',
  resolvedAt: null,
  resolvedBy: null,
  machineHostname: 'host-1',
  originHost: null,
  clientVersion: null,
  source: 'manual',
  errorType: null,
} as const;

describe('DomainRequestsDialogs', () => {
  it('confirms bulk approvals and propagates single-request rejection input', () => {
    const onBulkApproveConfirm = vi.fn();
    const onRejectReasonChange = vi.fn();

    render(
      <DomainRequestsDialogs
        bulkConfirm={{ mode: 'approve', requestIds: ['req-1', 'req-2'] }}
        approveModal={{ open: false, request: null }}
        rejectModal={{ open: true, request }}
        deleteModal={{ open: false, request: null }}
        rejectionReason=""
        actionsLoading={false}
        onBulkConfirmClose={vi.fn()}
        onBulkApproveConfirm={onBulkApproveConfirm}
        onBulkRejectConfirm={vi.fn()}
        onApproveClose={vi.fn()}
        onApproveConfirm={vi.fn()}
        onRejectClose={vi.fn()}
        onRejectConfirm={vi.fn()}
        onRejectReasonChange={onRejectReasonChange}
        onDeleteClose={vi.fn()}
        onDeleteConfirm={vi.fn()}
        getGroupName={() => 'Grupo 1'}
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
