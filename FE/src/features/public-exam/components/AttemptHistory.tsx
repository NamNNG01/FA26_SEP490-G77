import React, { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/assets/icons';
import {
  attemptsFor,
  attemptStatusLabel,
  attemptStatusVariant,
  formatAttemptDate,
  formatDuration,
  type ExamAttempt,
} from '../mockExamAttempts';
import type { PublicExam } from '../mockPublicExams';

/**
 * AttemptHistory
 *
 * The History tab. One compact row per attempt inside a single card, split by a
 * hairline divider rather than a card per attempt. Each row is a real <button>
 * so it is keyboard-activatable and opens the attempt summary in a Modal —
 * the detail page stays a single screen, no navigation.
 *
 * The summary is deliberately aggregate-only: score, correct / wrong /
 * unanswered, time spent and status. No per-question answer key is rendered, so
 * this tab cannot leak correct answers even if an attempt is still running.
 */

/** Label / value pair in the modal's summary grid. */
function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="text-[13px] font-semibold" style={accent ? { color: accent } : undefined}>
        {value}
      </dd>
    </div>
  );
}

function AttemptSummaryModal({
  attempt,
  exam,
  onClose,
}: {
  attempt: ExamAttempt | null;
  exam: PublicExam;
  onClose: () => void;
}) {
  if (!attempt) return null;

  const answered = attempt.correct + attempt.wrong;
  const progress = Math.round((answered / exam.questions) * 100);

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={`Attempt #${attempt.attemptNumber}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-muted-foreground">
            {formatAttemptDate(attempt.startedAt)}
          </span>
          <Badge variant={attemptStatusVariant(attempt.status)}>
            {attemptStatusLabel(attempt.status)}
          </Badge>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Headline score — only a completed attempt has one. */}
        <div className="rounded-[12px] border border-line bg-surface-alt p-4">
          {attempt.score !== undefined ? (
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-bold leading-none text-foreground">
                {attempt.score}%
              </span>
              <span className="text-[13px] text-muted-foreground">
                {attempt.correct} of {exam.questions} correct
              </span>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-[20px] font-bold leading-none text-foreground">In progress</span>
              <span className="text-[13px] text-muted-foreground">{progress}% answered</span>
            </div>
          )}

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-accent">
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{
                width: `${attempt.score !== undefined ? attempt.score : progress}%`,
                background: attempt.score === undefined || attempt.score >= 70 ? '#16A34A' : '#D97706',
              }}
            />
          </div>
        </div>

        <dl className="divide-y divide-line rounded-[12px] border border-line px-4">
          <SummaryRow label="Correct answers" value={String(attempt.correct)} accent="#16A34A" />
          <SummaryRow label="Wrong answers" value={String(attempt.wrong)} accent="#DC2626" />
          <SummaryRow label="Unanswered" value={String(attempt.unanswered)} />
          <SummaryRow label="Time spent" value={`${formatDuration(attempt.timeSpentMin)} of ${exam.duration} min`} />
          <SummaryRow label="Status" value={attemptStatusLabel(attempt.status)} />
        </dl>
      </div>
    </Modal>
  );
}

export function AttemptHistory({ exam }: { exam: PublicExam }) {
  const [selected, setSelected] = useState<ExamAttempt | null>(null);
  const attempts = attemptsFor(exam);

  if (attempts.length === 0) {
    return (
      <section className="rounded-[14px] border border-line bg-surface px-6 py-14 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent text-content-subtle">
          <Icon.Clock className="h-6 w-6" />
        </div>
        <p className="mt-3 text-[15px] font-semibold text-foreground">
          No attempt history available.
        </p>
        <p className="mx-auto mt-1 max-w-xs text-[13px] text-muted-foreground">
          Start the exam to create your first attempt.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Attempt history" className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-[15px] font-semibold text-foreground">Attempt History</h2>
        <span className="h-px flex-1 bg-line" />
        <span className="text-[12.5px] text-muted-foreground">
          {attempts.length} attempt{attempts.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="divide-y divide-line rounded-[14px] border border-line bg-surface shadow-sm">
        {attempts.map(attempt => (
          <button
            key={attempt.id}
            type="button"
            onClick={() => setSelected(attempt)}
            className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-foreground">
                Attempt #{attempt.attemptNumber}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                {formatAttemptDate(attempt.startedAt)}
              </span>
            </span>

            <span className="flex flex-shrink-0 items-center gap-4">
              <span className="text-[13px] font-semibold text-foreground">
                {attempt.score !== undefined ? `${attempt.score}%` : '—'}
              </span>
              <span className="text-[12.5px] text-muted-foreground">
                {attempt.correct} / {exam.questions} Correct
              </span>
              <span className="w-16 text-right text-[12.5px] text-muted-foreground">
                {formatDuration(attempt.timeSpentMin)}
              </span>
              <Badge variant={attemptStatusVariant(attempt.status)}>
                {attemptStatusLabel(attempt.status)}
              </Badge>
            </span>

            <Icon.ChevronRight className="h-4 w-4 flex-shrink-0 text-content-subtle" />
          </button>
        ))}
      </div>

      <AttemptSummaryModal attempt={selected} exam={exam} onClose={() => setSelected(null)} />
    </section>
  );
}
