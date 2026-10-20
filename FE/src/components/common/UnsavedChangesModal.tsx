import React from 'react';
import type { Blocker } from 'react-router';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';

/** Confirms leaving a page held by useUnsavedChangesGuard. */
export function UnsavedChangesModal({
  blocker,
  title = 'Leave without saving?',
  message = 'You have unsaved changes. If you leave this page now, they will be lost.',
  details,
}: {
  blocker: Blocker;
  title?: string;
  message?: string;
  /** Optional list of what will be lost, shown under the message. */
  details?: string[];
}) {
  const open = blocker.state === 'blocked';
  const stay = () => blocker.reset?.();

  return (
    <Modal
      open={open}
      onClose={stay}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={stay}>Keep editing</Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>Leave page</Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full bg-warning-light flex items-center justify-center flex-shrink-0">
          <Icon.AlertCircle className="w-5 h-5 text-warning" />
        </span>
        <div className="space-y-2">
          <p className="text-sm text-content-secondary">{message}</p>
          {details && details.length > 0 && (
            <ul className="list-disc pl-5 space-y-0.5 text-sm text-content-soft">
              {details.map(d => <li key={d}>{d}</li>)}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
