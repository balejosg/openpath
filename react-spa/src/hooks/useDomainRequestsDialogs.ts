import { useState } from 'react';
import type { DomainRequest } from '@openpath/api';
import { reportError } from '../lib/reportError';

interface RequestModalState {
  open: boolean;
  request: DomainRequest | null;
}

interface UseDomainRequestsDialogsOptions {
  approveRequest: (id: string) => Promise<unknown>;
  rejectRequest: (input: { id: string; reason?: string }) => Promise<unknown>;
  deleteRequest: (id: string) => Promise<unknown>;
}

export function useDomainRequestsDialogs({
  approveRequest,
  rejectRequest,
  deleteRequest,
}: UseDomainRequestsDialogsOptions) {
  const [approveModal, setApproveModal] = useState<RequestModalState>({
    open: false,
    request: null,
  });
  const [rejectModal, setRejectModal] = useState<RequestModalState>({
    open: false,
    request: null,
  });
  const [deleteModal, setDeleteModal] = useState<RequestModalState>({
    open: false,
    request: null,
  });
  const [rejectionReason, setRejectionReason] = useState('');

  const handleApprove = async () => {
    if (!approveModal.request) return;
    try {
      await approveRequest(approveModal.request.id);
      setApproveModal({ open: false, request: null });
    } catch (err) {
      reportError('Error approving request:', err);
    }
  };

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
      reportError('Error rejecting request:', err);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.request) return;
    try {
      await deleteRequest(deleteModal.request.id);
      setDeleteModal({ open: false, request: null });
    } catch (err) {
      reportError('Error deleting request:', err);
    }
  };

  return {
    approveModal,
    setApproveModal,
    rejectModal,
    setRejectModal,
    deleteModal,
    setDeleteModal,
    rejectionReason,
    setRejectionReason,
    handleApprove,
    handleReject,
    handleDelete,
  };
}
