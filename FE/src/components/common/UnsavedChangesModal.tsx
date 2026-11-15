import React from 'react';
import type { Blocker } from 'react-router';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/** Confirms leaving a page held by useUnsavedChangesGuard. */
export function UnsavedChangesModal({
  blocker,
  title = 'Leave without saving?',
  message = 'You have unsaved changes. If you leave this page now, they will be lost.',
  details,
  onLeave,
}: {
  blocker: Blocker;
  /** Runs when the user confirms leaving, before the navigation goes ahead (e.g. drop a stored draft). */
  onLeave?: () => void;
  title?: string;
  message?: string;
  /** Optional list of what will be lost, shown under the message. */
  details?: string[];
}) {
  const open = blocker.state === 'blocked';
  const stay = () => blocker.reset?.();

  return (
    <ConfirmDialog
      open={open}
      onClose={stay}
      onConfirm={() => { onLeave?.(); blocker.proceed?.(); }}
      title={title}
      description={message}
      confirmLabel="Leave page"
      cancelLabel="Keep editing"
      tone="danger"
    >
      {details && details.length > 0 && (
        <ul className="list-disc pl-5 space-y-0.5 text-content-soft">
          {details.map(d => <li key={d}>{d}</li>)}
        </ul>
      )}
    </ConfirmDialog>
  );
}
