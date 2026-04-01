import type { DomainRequest } from '@openpath/api';
import { ConfirmDialog, DangerConfirmDialog } from '../ui/ConfirmDialog';

interface RequestModalState {
  open: boolean;
  request: DomainRequest | null;
}

interface BulkConfirmState {
  mode: 'approve' | 'reject';
  requestIds: string[];
  rejectReason?: string;
}

interface DomainRequestsDialogsProps {
  bulkConfirm: BulkConfirmState | null;
  approveModal: RequestModalState;
  rejectModal: RequestModalState;
  deleteModal: RequestModalState;
  rejectionReason: string;
  actionsLoading: boolean;
  onBulkConfirmClose: () => void;
  onBulkApproveConfirm: (requestIds: string[]) => void;
  onBulkRejectConfirm: (requestIds: string[], reason?: string) => void;
  onApproveClose: () => void;
  onApproveConfirm: () => void | Promise<void>;
  onRejectClose: () => void;
  onRejectConfirm: () => void | Promise<void>;
  onRejectReasonChange: (value: string) => void;
  onDeleteClose: () => void;
  onDeleteConfirm: () => void | Promise<void>;
  getGroupName: (groupId: string) => string;
}

export function DomainRequestsDialogs({
  bulkConfirm,
  approveModal,
  rejectModal,
  deleteModal,
  rejectionReason,
  actionsLoading,
  onBulkConfirmClose,
  onBulkApproveConfirm,
  onBulkRejectConfirm,
  onApproveClose,
  onApproveConfirm,
  onRejectClose,
  onRejectConfirm,
  onRejectReasonChange,
  onDeleteClose,
  onDeleteConfirm,
  getGroupName,
}: DomainRequestsDialogsProps) {
  return (
    <>
      {bulkConfirm ? (
        bulkConfirm.mode === 'approve' ? (
          <ConfirmDialog
            isOpen
            title="Aprobar solicitudes"
            confirmLabel="Aprobar"
            cancelLabel="Cancelar"
            disableConfirm={bulkConfirm.requestIds.length === 0}
            onClose={onBulkConfirmClose}
            onConfirm={() => onBulkApproveConfirm(bulkConfirm.requestIds)}
          >
            <p className="text-sm text-slate-600">
              ¿Aprobar {bulkConfirm.requestIds.length} solicitudes seleccionadas?
            </p>
            <p className="text-xs text-slate-500">
              Las solicitudes se aprobarán en sus grupos originales.
            </p>
          </ConfirmDialog>
        ) : (
          <DangerConfirmDialog
            isOpen
            title="Rechazar solicitudes"
            confirmLabel="Rechazar"
            cancelLabel="Cancelar"
            disableConfirm={bulkConfirm.requestIds.length === 0}
            onClose={onBulkConfirmClose}
            onConfirm={() => onBulkRejectConfirm(bulkConfirm.requestIds, bulkConfirm.rejectReason)}
          >
            <p className="text-sm text-slate-600">
              ¿Rechazar {bulkConfirm.requestIds.length} solicitudes seleccionadas?
            </p>
            {bulkConfirm.rejectReason ? (
              <p className="text-xs text-slate-500 break-words">
                Motivo (opcional): <span className="font-medium">{bulkConfirm.rejectReason}</span>
              </p>
            ) : (
              <p className="text-xs text-slate-500">Motivo (opcional): (sin motivo)</p>
            )}
          </DangerConfirmDialog>
        )
      ) : null}

      {approveModal.open && approveModal.request && (
        <ConfirmDialog
          isOpen
          title="Aprobar Solicitud"
          confirmLabel="Aprobar"
          cancelLabel="Cancelar"
          isLoading={actionsLoading}
          onClose={onApproveClose}
          onConfirm={onApproveConfirm}
        >
          <p className="text-sm text-slate-600">
            Aprobar acceso a <strong>{approveModal.request.domain}</strong> solicitado por{' '}
            <strong>{approveModal.request.machineHostname ?? 'máquina desconocida'}</strong>
          </p>
          <p className="text-sm text-slate-600">
            La solicitud se aprobara en el grupo original:{' '}
            <strong>{getGroupName(approveModal.request.groupId)}</strong>
          </p>
        </ConfirmDialog>
      )}

      {rejectModal.open && rejectModal.request && (
        <DangerConfirmDialog
          isOpen
          title="Rechazar Solicitud"
          confirmLabel="Rechazar"
          cancelLabel="Cancelar"
          isLoading={actionsLoading}
          onClose={onRejectClose}
          onConfirm={onRejectConfirm}
        >
          <p className="text-sm text-slate-600">
            Rechazar acceso a <strong>{rejectModal.request.domain}</strong> solicitado por{' '}
            <strong>{rejectModal.request.machineHostname ?? 'máquina desconocida'}</strong>
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Motivo del rechazo (opcional)
            </label>
            <textarea
              value={rejectionReason}
              onChange={(event) => onRejectReasonChange(event.target.value)}
              placeholder="Explica por qué se rechaza esta solicitud..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </DangerConfirmDialog>
      )}

      {deleteModal.open && deleteModal.request && (
        <DangerConfirmDialog
          isOpen
          title="Eliminar Solicitud"
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          isLoading={actionsLoading}
          onClose={onDeleteClose}
          onConfirm={onDeleteConfirm}
        >
          <p className="text-sm text-slate-600">
            ¿Estás seguro de que deseas eliminar la solicitud de acceso a{' '}
            <strong>{deleteModal.request.domain}</strong>?
          </p>
          <p className="text-xs text-slate-500">Esta acción no se puede deshacer.</p>
        </DangerConfirmDialog>
      )}
    </>
  );
}
