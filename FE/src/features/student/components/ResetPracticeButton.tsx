import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import { modulePracticeService, type PracticeScope } from '@/services/modulePractice.service';

/**
 * MP-12: deletes this module's (or the General pool's) practice sessions, attempts and progress —
 * never the notebook, bookmarks, exams or flashcards. Asks once before.
 */
export function ResetPracticeButton({ scope, moduleTitle, onReset }: { scope: PracticeScope; moduleTitle: string; onReset: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await modulePracticeService.resetProgress(scope);
      toast.success('Practice progress reset.');
      setOpen(false);
      onReset();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not reset the practice progress.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        icon={<Icon.RotateCcw className="w-4 h-4" />}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Reset progress
      </Button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Reset practice progress?"
        error={error && <Alert type="error" message={error} />}
        size="sm"
        footer={
          <>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button variant="danger" loading={busy} disabled={busy} onClick={reset}>
              Reset
            </Button>
          </>
        }
      >
        <p className="text-base text-content-secondary leading-relaxed">
          Every practice session, answer and statistic of <strong>{moduleTitle}</strong> will be deleted, including a session in
          progress. Your mistake notebook, bookmarks, exams and flashcards are not affected. This cannot be undone.
        </p>
      </Modal>
    </>
  );
}
