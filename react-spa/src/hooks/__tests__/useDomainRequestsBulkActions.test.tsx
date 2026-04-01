import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDomainRequestsBulkActions } from '../useDomainRequestsBulkActions';

const requests = [
  {
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
    originHost: null,
    machineHostname: null,
    clientVersion: null,
    source: 'manual',
    errorType: null,
  },
] as const;

describe('useDomainRequestsBulkActions', () => {
  it('opens a bulk-approve confirmation and clears selection after success', async () => {
    const setSelectedRequestIds = vi.fn();
    const approveRequest = vi.fn().mockResolvedValue({ success: true });

    const { result } = renderHook(() =>
      useDomainRequestsBulkActions({
        requests: [...requests],
        selectedPendingRequests: [...requests],
        setSelectedRequestIds,
        approveRequest,
        rejectRequest: vi.fn(),
      })
    );

    act(() => {
      result.current.openBulkApproveConfirm();
    });

    expect(result.current.bulkConfirm).toEqual({
      mode: 'approve',
      requestIds: ['req-1'],
    });

    await act(async () => {
      await result.current.runBulkApprove(['req-1']);
    });

    expect(approveRequest).toHaveBeenCalledWith('req-1');
    expect(setSelectedRequestIds).toHaveBeenCalledWith([]);
  });
});
