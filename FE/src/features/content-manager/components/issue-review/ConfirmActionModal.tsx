import type { ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

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
  return (
    <ConfirmDialog
      open={open}
      onClose={onCancel}
      onConfirm={onConfirm}
      title={title}
      description={<div className="space-y-2">{children}</div>}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      tone={variant === 'danger' ? 'danger' : 'warning'}
      loading={busy}
    />
  );
}
