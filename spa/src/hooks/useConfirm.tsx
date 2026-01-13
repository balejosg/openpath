import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface UseConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}

export function useConfirm() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<UseConfirmOptions>({
    message: '',
  });
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

  const confirm = (opts: UseConfirmOptions): Promise<boolean> => {
    setOptions({
      title: opts.title ?? 'Confirmar acción',
      confirmText: opts.confirmText ?? 'Confirmar',
      cancelText: opts.cancelText ?? 'Cancelar',
      variant: opts.variant ?? 'danger',
      ...opts,
    });
    setIsOpen(true);

    return new Promise<boolean>((resolve) => {
      setResolvePromise(() => resolve);
    });
  };

  const handleConfirm = () => {
    if (resolvePromise) resolvePromise(true);
    setIsOpen(false);
  };

  const handleCancel = () => {
    if (resolvePromise) resolvePromise(false);
    setIsOpen(false);
  };

  const ConfirmDialog = () => (
    <Modal open={isOpen} onClose={handleCancel} title={options.title ?? 'Confirmar acción'}>
      <div className="space-y-4">
        <p className="text-slate-700">{options.message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleCancel}>
            {options.cancelText}
          </Button>
          <Button variant={options.variant} onClick={handleConfirm}>
            {options.confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );

  return { confirm, ConfirmDialog };
}
