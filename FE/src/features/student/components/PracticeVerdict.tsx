import type { ReactNode } from 'react';
import { Icon } from '@/assets/icons';
import { AWAITING_GRADE, type PracticeAttempt, type SessionQuestionSummary } from '@/services/modulePractice.service';

interface Criterion {
  name?: string;
  points?: number;
  maxPoints?: number;
  feedback?: string;
}

/**
 * Palette tone of one practice question: correct / wrong from the verdict; `partial` for a rubric
 * answer the AI scored (it has a score, not a right/wrong); nothing while ungraded or failed.
 */
export function summaryOutcome(
  q: Pick<SessionQuestionSummary, 'answered' | 'latestIsCorrect' | 'gradingStatus'>,
): 'correct' | 'wrong' | 'partial' | null {
  if (!q.answered) return null;
  if (q.latestIsCorrect === true) return 'correct';
  if (q.latestIsCorrect === false) return 'wrong';
  return q.gradingStatus === 'AI_GRADED' ? 'partial' : null;
}

/** Rubric scores are out of 1.00: shown as a percent. */
export function scorePercent(score: number | null | undefined): number {
  return Math.round(Number(score ?? 0) * 100);
}

/**
 * The outcome of the latest attempt of a practice question. The BE never reveals the right answer
 * here: a wrong one points to the explanation; a rubric one shows the AI score and its feedback.
 */
export function PracticeVerdict({ attempt }: { attempt: PracticeAttempt }) {
  if (AWAITING_GRADE.has(attempt.gradingStatus)) {
    return (
      <Box tone="neutral" icon={<Icon.RefreshCw className="w-4 h-4 animate-spin" />}>
        <span className="flex-1">AI is grading your answer… You can move on and come back later.</span>
      </Box>
    );
  }

  if (attempt.gradingStatus === 'FAILED') {
    return (
      <Box tone="neutral" icon={<Icon.AlertCircle className="w-4 h-4" />}>
        <span className="flex-1">Your answer is saved, but it could not be graded this time.</span>
      </Box>
    );
  }

  if (attempt.isCorrect === true) {
    return (
      <Box tone="success" icon={<Icon.CheckCircle className="w-4 h-4" />}>
        <span className="flex-1">Correct!</span>
      </Box>
    );
  }

  if (attempt.isCorrect === false) {
    return (
      <Box tone="danger" icon={<Icon.XCircle className="w-4 h-4" />}>
        <span className="flex-1">Not quite. Ask for an explanation below to see why.</span>
      </Box>
    );
  }

  // AI-graded rubric answer: a score with its feedback.
  const overall = feedbackText(attempt.feedback);
  const criteria = Array.isArray(attempt.criteriaScores) ? (attempt.criteriaScores as Criterion[]) : [];
  return (
    <div className="rounded-[10px] border border-line bg-surface px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-content">
        <Icon.Award className="w-4 h-4 text-brand-ink" /> AI score: {scorePercent(attempt.scoreEarned)}%
      </div>
      {overall && <p className="text-sm text-content-secondary leading-relaxed whitespace-pre-line">{overall}</p>}
      {criteria.length > 0 && (
        <ul className="space-y-2">
          {criteria.map((c, i) => (
            <li key={i} className="text-sm">
              <div className="flex justify-between gap-3 font-medium text-content">
                <span>{c.name ?? `Criterion ${i + 1}`}</span>
                <span className="text-content-soft flex-shrink-0">
                  {Number(c.points ?? 0)} / {Number(c.maxPoints ?? 0)}
                </span>
              </div>
              {c.feedback && <p className="text-xs text-content-soft mt-0.5">{c.feedback}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function feedbackText(feedback: unknown): string | null {
  if (typeof feedback === 'string') return feedback.trim() || null;
  if (feedback && typeof feedback === 'object' && 'overallFeedback' in feedback) {
    const v = (feedback as { overallFeedback?: unknown }).overallFeedback;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  }
  return null;
}

const TONE = {
  success: 'border-success-line bg-success-light text-success-strong',
  danger: 'border-danger-line bg-danger-light text-danger-strong',
  neutral: 'border-line bg-surface text-content-soft',
} as const;

function Box({ tone, icon, children }: { tone: keyof typeof TONE; icon: ReactNode; children: ReactNode }) {
  return (
    <div role="status" className={`flex flex-wrap items-center gap-2 rounded-[10px] border px-4 py-3 text-sm font-medium ${TONE[tone]}`}>
      <span className="flex-shrink-0">{icon}</span>
      {children}
    </div>
  );
}
