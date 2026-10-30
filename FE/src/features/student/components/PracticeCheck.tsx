import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';
import type { AnswerResponse, AttemptQuestion } from '@/services/studentAttempt.service';
import { INSTANT_CHECK_TYPES, blankKeys, type AnswerCheck } from '@/services/studentPracticeExam.service';
import { isAnswered } from './QuestionAnswerInput';

export interface CheckProgress {
  /** Text of the check button: says how far the answer is. */
  label: string;
  /** The answer is complete enough to be checked. */
  ready: boolean;
  /** Why it can't be checked yet. */
  hint: string | null;
}

/** Practice: what the check button of a question says, and whether it can be pressed. */
export function checkProgress(q: AttemptQuestion, response: AnswerResponse | null | undefined): CheckProgress {
  switch (q.questionType) {
    case 'MULTIPLE_CHOICE': {
      const n = response?.selectedOptionIds?.length ?? 0;
      return { label: 'Check answer', ready: n > 0, hint: n > 0 ? null : 'Pick every correct option, then check.' };
    }
    case 'MATCHING': {
      const lefts = q.matching?.lefts ?? [];
      const done = new Set((response?.matches ?? []).filter(m => m.right).map(m => m.left));
      const n = lefts.filter(l => done.has(l)).length;
      const ready = lefts.length > 0 && n === lefts.length;
      return { label: `Check answer (${n}/${lefts.length} pairs)`, ready, hint: ready ? null : 'Match every item to check.' };
    }
    case 'FILL_BLANK': {
      const keys = blankKeys(q);
      const n = keys.filter(k => response?.blanks?.[k]?.trim()).length;
      const ready = n === keys.length;
      return {
        label: keys.length > 1 ? `Check answer (${n}/${keys.length} blanks)` : 'Check answer',
        ready,
        hint: ready ? 'Press Enter in the last blank to check.' : keys.length > 1 ? 'Fill every blank to check.' : 'Type your answer to check.',
      };
    }
    case 'ORDERING':
      return { label: 'Lock in order', ready: true, hint: 'Put the items in order, then lock it in.' };
    default:
      return { label: 'Check answer', ready: isAnswered(response), hint: null };
  }
}

/**
 * Practice mode, below the answer: before the check, the check button (single choice /
 * true-false have none — the pick is the check); after it, only the explanation (collapsed) —
 * the revealed answer itself shows what is right. The page's own "Next question" button goes on.
 */
export function PracticeCheck({
  question,
  check,
  checking,
  progress,
  checkable,
  focusNext,
  onCheck,
}: {
  question: AttemptQuestion;
  check: AnswerCheck | undefined;
  checking: boolean;
  progress: CheckProgress;
  checkable: boolean;
  /** Just checked: move the focus to the page's "Next question" so Enter goes on. */
  focusNext: boolean;
  onCheck: () => void;
}) {
  const [showExplanation, setShowExplanation] = useState(false);
  useEffect(() => {
    if (check && focusNext) document.querySelector<HTMLButtonElement>('[data-next-question]')?.focus({ preventScroll: true });
  }, [check, focusNext]);

  if (!check) {
    if (!checkable) {
      return <p className="text-xs text-content-subtle">The correct answer of this question type shows after you submit.</p>;
    }
    if (INSTANT_CHECK_TYPES.has(question.questionType)) {
      return (
        <p className="text-xs text-content-subtle">
          {checking ? 'Checking…' : 'Pick an answer — it is checked right away and locked.'}
          <span className="hidden md:inline"> Keys: 1–{Math.min(question.options?.length ?? 4, 9)} or A–{optionLetterOf(question)}.</span>
        </p>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button
          icon={<Icon.CheckCircle className="w-4 h-4" />}
          loading={checking}
          disabled={!progress.ready || checking}
          onClick={onCheck}
        >
          {progress.label}
        </Button>
        <span className="text-xs text-content-subtle">
          {progress.hint ?? 'Your answer is locked once checked.'}
          {progress.ready && question.questionType !== 'FILL_BLANK' && <span className="hidden md:inline"> Press Enter to check.</span>}
        </span>
      </div>
    );
  }

  if (!check.supported) {
    return (
      <div role="status" className="flex items-center gap-2 rounded-[10px] border border-line bg-surface px-4 py-3 text-sm font-medium text-content-soft">
        <Icon.Info className="w-4 h-4 flex-shrink-0" /> Answer saved — the correct answer shows after you submit.
      </div>
    );
  }

  const explanation = check.explanation?.trim();
  const panelId = `explanation-${question.questionId}`;

  // The marked answer above already says what is right; this box is only the explanation, in the system colours.
  return (
    <div className="rounded-[10px] bg-primary-light/60 border border-line">
      <button
        type="button"
        aria-expanded={showExplanation}
        aria-controls={panelId}
        onClick={() => setShowExplanation(s => !s)}
        className="w-full flex items-center gap-1.5 px-3 py-2.5 text-left text-xs font-semibold text-brand-ink uppercase tracking-wide"
      >
        <Icon.Lightbulb className="w-4 h-4 flex-shrink-0" />
        {showExplanation ? 'Hide explanation' : 'Show explanation'}
        {check.demo && (
          <Badge variant="warning" size="sm">
            Demo
          </Badge>
        )}
        <Icon.ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showExplanation ? 'rotate-180' : ''}`} />
      </button>
      {showExplanation && (
        <div id={panelId} className="px-3 pb-3 text-sm leading-relaxed text-content-secondary whitespace-pre-line break-words">
          {explanation || <span className="text-content-subtle">No explanation has been added to this question yet.</span>}
        </div>
      )}
    </div>
  );
}

/** Last option letter of a choice question, for the shortcut hint. */
function optionLetterOf(q: AttemptQuestion): string {
  return String.fromCharCode(64 + Math.min(Math.max(q.options?.length ?? 1, 1), 26));
}
