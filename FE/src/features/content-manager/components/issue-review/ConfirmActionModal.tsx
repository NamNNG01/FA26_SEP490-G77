import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

/** Small confirmation layered over the review modal, for actions that change data or close a ticket. */
export function ConfirmActionModal({ open, title, children, confirmLabel, cancelLabel = 'Cancel', variant = 'primary', busy, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return <Modal
    open={open}
    onClose={onCancel}
    title={title}
    size="sm"
    dismissible={!busy}
    footer={<>
      <Button variant="outline" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
      <Button variant={variant} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
    </>}
  >
    <div className="space-y-2 text-sm text-content-secondary">{children}</div>
  </Modal>;
}
