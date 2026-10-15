import type { PublicExam } from './mockPublicExams';

/**
 * Attempt history for the History tab.
 *
 * Deterministic and seeded from the exam id, so the same exam always produces
 * the same history. The generator holds three coherence rules that keep the tab
 * from contradicting the rest of the page:
 *
 *   1. correct + wrong + unanswered === exam.questions
 *   2. the newest COMPLETED attempt's score === exam.score (so the History row
 *      agrees with the Overview "Your result" card)
 *   3. timeSpentMin <= exam.duration
 *
 * Timestamps are derived from a fixed anchor rather than Date.now() so the
 * rendered output is reproducible, and every formatter pins timeZone: 'UTC' so
 * the displayed string does not drift with the machine's locale.
 */

export type AttemptStatus = 'completed' | 'in-progress' | 'abandoned';

export interface ExamAttempt {
  id: string;
  /** 1-based. The list is returned newest-first, so numbers count down. */
  attemptNumber: number;
  /** ISO 8601, UTC. */
  startedAt: string;
  /** Absent while the attempt is still running. */
  submittedAt?: string;
  status: AttemptStatus;
  /** Percent — completed attempts only. */
  score?: number;
  correct: number;
  wrong: number;
  unanswered: number;
  /** Minutes actually spent, never more than the exam's time limit. */
  timeSpentMin: number;
}

/** Most recent timestamp any attempt can carry. */
const ANCHOR = Date.UTC(2026, 9, 5, 14, 30); // 05 Oct 2026 14:30 UTC
const HOUR = 60 * 60 * 1000;

const STATUS_LABEL: Record<AttemptStatus, string> = {
  completed: 'Completed',
  'in-progress': 'In Progress',
  abandoned: 'Abandoned',
};

const STATUS_VARIANT: Record<AttemptStatus, 'success' | 'warning' | 'danger'> = {
  completed: 'success',
  'in-progress': 'warning',
  abandoned: 'danger',
};

export function attemptStatusLabel(status: AttemptStatus): string {
  return STATUS_LABEL[status];
}

export function attemptStatusVariant(status: AttemptStatus): 'success' | 'warning' | 'danger' {
  return STATUS_VARIANT[status];
}

/** "05 Oct 2026 • 14:30" — pinned to en-GB / UTC so it never drifts. */
export function formatAttemptDate(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  return `${day} • ${time}`;
}

/** "58 min" / "1h 12m" once an attempt runs past an hour. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Newest-first attempt list for an exam.
 *
 *   available    → none yet, so the tab shows its empty state
 *   in-progress  → exactly one running attempt (no score, no submittedAt)
 *   completed    → 2-4 attempts, mixing abandoned runs and earlier attempts
 */
export function attemptsFor(exam: PublicExam): ExamAttempt[] {
  if (exam.status === 'available') return [];

  const seed = [...exam.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const total = exam.questions;

  if (exam.status === 'in-progress') {
    const answered = Math.min(total, Math.round(total * (0.3 + (seed % 5) / 10)));
    const correct = Math.round(answered * (0.55 + (seed % 20) / 100));
    const startedAt = new Date(ANCHOR - 26 * HOUR).toISOString();
    return [
      {
        id: `${exam.id}-A1`,
        attemptNumber: 1,
        startedAt,
        status: 'in-progress',
        correct,
        wrong: answered - correct,
        unanswered: total - answered,
        timeSpentMin: Math.max(1, Math.round(exam.duration * 0.45)),
      },
    ];
  }

  // Completed: the newest run carries exam.score so the two views agree.
  const count = 2 + (seed % 3); // 2-4
  const attempts: ExamAttempt[] = [];
  let cursor = ANCHOR;

  for (let i = 0; i < count; i++) {
    const id = `${exam.id}-A${i + 1}`;
    const isNewest = i === 0;

    // Older runs skew lower — a learner's score improves as they practise.
    const score = isNewest
      ? exam.score!
      : Math.max(45, Math.min(92, (exam.score ?? 70) - 6 - i * 7 + (seed % 5)));
    const status: AttemptStatus = isNewest ? 'completed' : (seed + i) % 3 === 0 ? 'abandoned' : 'completed';

    const unanswered = status === 'abandoned' ? Math.min(total, 3 + ((seed + i) % 8)) : (seed + i) % 3 === 0 ? 1 : 0;
    const answered = total - unanswered;
    // Derive the tally FROM the score, never the reverse — rounding back the
    // other way would drift the displayed score by a point on some totals.
    const correct = Math.min(answered, Math.round((total * score) / 100));
    const wrong = answered - correct;

    // An abandoned run never used its full allowance; a submitted one came close.
    const timeSpentMin =
      status === 'abandoned'
        ? Math.max(1, Math.round(exam.duration * (0.25 + ((seed + i) % 4) / 10)))
        : Math.max(1, exam.duration - ((seed + i) % 9));

    const startedAt = new Date(cursor).toISOString();
    // Every attempt in this branch was submitted — an abandoned run still ends
    // with a submit (or a discard) timestamp.
    const submittedAt = new Date(new Date(startedAt).getTime() + timeSpentMin * 60 * 1000).toISOString();
    cursor -= (26 + ((seed + i) % 60)) * HOUR;

    attempts.push({
      id,
      attemptNumber: count - i,
      startedAt,
      submittedAt,
      status,
      score: status === 'completed' ? score : undefined,
      correct,
      wrong,
      unanswered,
      timeSpentMin: Math.min(timeSpentMin, exam.duration),
    });
  }

  return attempts;
}
