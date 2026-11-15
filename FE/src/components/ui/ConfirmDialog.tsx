import React from 'react';
import { Icon } from '@/assets/icons';
import { Button } from './Button';
import { Modal } from './Modal';

export type ConfirmTone = 'warning' | 'danger';

const TONE: Record<ConfirmTone, { icon: React.ReactNode; badge: string; button: 'primary' | 'danger' }> = {
  warning: { icon: <Icon.AlertTriangle className="w-6 h-6" />, badge: 'bg-warning-light text-warning-strong', button: 'primary' },
  danger: { icon: <Icon.AlertTriangle className="w-6 h-6" />, badge: 'bg-danger-light text-danger-strong', button: 'danger' },
};

/**
 * Centered "are you sure?" alert: an icon, the question in bold, a muted line on what follows,
 * then Cancel / confirm side by side. `danger` is for destructive actions (delete, discard);
 * `warning` for the rest (publish, submit, reset…). Extra content (a list, a summary) goes in
 * `children`, under the description.
 */
export function ConfirmDialog({
  open, onClose, onConfirm, title, description, children, confirmLabel, cancelLabel = 'Cancel',
  tone = 'warning', loading = false, confirmDisabled = false, icon, error, dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel: React.ReactNode;
  cancelLabel?: React.ReactNode;
  tone?: ConfirmTone;
  /** Shows a spinner on the confirm button and locks both buttons and closing. */
  loading?: boolean;
  confirmDisabled?: boolean;
  /** Replaces the tone's icon. */
  icon?: React.ReactNode;
  /** An Alert shown over the top of the dialog (see Modal). */
  error?: React.ReactNode;
  dismissible?: boolean;
}) {
  const t = TONE[tone];
  // Half-width buttons: longer labels ("Discard & duplicate") wrap instead of overflowing.
  const btnCls = 'w-full h-auto min-h-9 py-2 whitespace-normal';
  return (
    <Modal open={open} onClose={onClose} size="sm" error={error} dismissible={dismissible && !loading}>
      <div className="flex flex-col items-center text-center pt-2">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${t.badge}`} aria-hidden="true">
          {icon ?? t.icon}
        </div>
        <h3 className="mt-4 text-lg font-semibold text-content">{title}</h3>
        {description && <div className="mt-1.5 text-sm text-content-soft">{description}</div>}
      </div>
      {children && <div className="mt-4 text-sm text-content-secondary">{children}</div>}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button variant="outline" className={btnCls} onClick={onClose} disabled={loading}>{cancelLabel}</Button>
        <Button variant={t.button} className={btnCls} onClick={onConfirm} loading={loading} disabled={loading || confirmDisabled}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
