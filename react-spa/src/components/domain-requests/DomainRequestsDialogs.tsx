import type { DomainRequestsDialogsModel } from '../../hooks/useDomainRequestsViewModel';
import { ConfirmDialog, DangerConfirmDialog } from '../ui/ConfirmDialog';

interface DomainRequestsDialogsProps {
  model: DomainRequestsDialogsModel;
}

export function DomainRequestsDialogs({ model }: DomainRequestsDialogsProps) {
  return (
    <>
      {model.bulkConfirm ? (
        model.bulkConfirm.mode === 'approve' ? (
          <ConfirmDialog
            isOpen
            title="Aprobar solicitudes"
            confirmLabel="Aprobar"
            cancelLabel="Cancelar"
            disableConfirm={model.bulkConfirm.requestIds.length === 0}
            onClose={model.onBulkConfirmClose}
            onConfirm={() => {
              void model.onBulkApproveConfirm(model.bulkConfirm?.requestIds ?? []);
            }}
          >
            <p className="text-sm text-slate-600">
              ¿Aprobar {model.bulkConfirm.requestIds.length} solicitudes seleccionadas?
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
            disableConfirm={model.bulkConfirm.requestIds.length === 0}
            onClose={model.onBulkConfirmClose}
            onConfirm={() => {
              void model.onBulkRejectConfirm(
                model.bulkConfirm?.requestIds ?? [],
                model.bulkConfirm?.rejectReason
              );
            }}
          >
            <p className="text-sm text-slate-600">
              ¿Rechazar {model.bulkConfirm.requestIds.length} solicitudes seleccionadas?
            </p>
            {model.bulkConfirm.rejectReason ? (
              <p className="text-xs text-slate-500 break-words">
                Motivo (opcional):{' '}
                <span className="font-medium">{model.bulkConfirm.rejectReason}</span>
              </p>
            ) : (
              <p className="text-xs text-slate-500">Motivo (opcional): (sin motivo)</p>
            )}
          </DangerConfirmDialog>
        )
      ) : null}

      {model.approveModal.open && model.approveModal.request && (
        <ConfirmDialog
          isOpen
          title="Aprobar Solicitud"
          confirmLabel="Aprobar"
          cancelLabel="Cancelar"
          isLoading={model.actionsLoading}
          onClose={model.onApproveClose}
          onConfirm={model.onApproveConfirm}
        >
          <p className="text-sm text-slate-600">
            Aprobar acceso a <strong>{model.approveModal.request.domain}</strong> solicitado por{' '}
            <strong>{model.approveModal.request.machineHostname}</strong>
          </p>
          <p className="text-sm text-slate-600">
            La solicitud se aprobara en el grupo original:{' '}
            <strong>{model.approveModal.request.groupName}</strong>
          </p>
        </ConfirmDialog>
      )}

      {model.rejectModal.open && model.rejectModal.request && (
        <DangerConfirmDialog
          isOpen
          title="Rechazar Solicitud"
          confirmLabel="Rechazar"
          cancelLabel="Cancelar"
          isLoading={model.actionsLoading}
          onClose={model.onRejectClose}
          onConfirm={model.onRejectConfirm}
        >
          <p className="text-sm text-slate-600">
            Rechazar acceso a <strong>{model.rejectModal.request.domain}</strong> solicitado por{' '}
            <strong>{model.rejectModal.request.machineHostname}</strong>
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Motivo del rechazo (opcional)
            </label>
            <textarea
              value={model.rejectionReason}
              onChange={(event) => model.onRejectReasonChange(event.target.value)}
              placeholder="Explica por qué se rechaza esta solicitud..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </DangerConfirmDialog>
      )}

      {model.deleteModal.open && model.deleteModal.request && (
        <DangerConfirmDialog
          isOpen
          title="Eliminar Solicitud"
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          isLoading={model.actionsLoading}
          onClose={model.onDeleteClose}
          onConfirm={model.onDeleteConfirm}
        >
          <p className="text-sm text-slate-600">
            ¿Estás seguro de que deseas eliminar la solicitud de acceso a{' '}
            <strong>{model.deleteModal.request.domain}</strong>?
          </p>
          <p className="text-xs text-slate-500">Esta acción no se puede deshacer.</p>
        </DangerConfirmDialog>
      )}
    </>
  );
}
